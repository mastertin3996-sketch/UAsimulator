import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const CAT_MAP: Record<string, string> = {
  GRAIN: "AGRO", VEGETABLE: "AGRO", FRUIT: "AGRO", LIVESTOCK_PRODUCT: "AGRO",
  TEXTILE: "TEXTILE", CLOTHING: "TEXTILE",
  PROCESSED_FOOD: "FOOD", BEVERAGE: "FOOD",
  RAW_MATERIAL: "INDUSTRIAL", INDUSTRIAL_GOOD: "INDUSTRIAL", FUEL: "INDUSTRIAL",
  EQUIPMENT: "INDUSTRIAL", BUILDING_MATERIAL: "INDUSTRIAL",
  CONSUMER_GOOD: "CONSUMER", ELECTRONICS: "CONSUMER", VEHICLE: "CONSUMER",
  SERVICE: "SERVICE", DIGITAL: "SERVICE",
};

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;

  const lastTick = await prisma.gameTick.findFirst({
    orderBy: { tickNumber: "desc" },
    select: { tickNumber: true },
  });

  // All recipes with inputs and outputs
  const recipes = await prisma.recipe.findMany({
    select: {
      id: true, name: true, ticksToComplete: true,
      outputs: { select: { product: { select: { id: true, nameUa: true, unit: true, category: true } }, quantityPerUnit: true } },
      inputs: { select: { product: { select: { id: true, nameUa: true, unit: true } }, quantityPerUnit: true } },
    },
  });

  // Player workshops → which recipes are in use
  const myWorkshops = await prisma.workshop.findMany({
    where: { enterprise: { playerId } },
    select: {
      productionOrders: {
        where: { status: "IN_PROGRESS" },
        select: { recipeId: true },
      },
    },
  });
  const myRecipeIds = new Set(myWorkshops.flatMap((w) => w.productionOrders.map((o) => o.recipeId)));

  // Player enterprise inventory (input stock)
  const myInventory = await prisma.enterpriseInventory.findMany({
    where: { enterprise: { playerId } },
    select: { productId: true, quantity: true },
  });
  const stockMap = new Map<string, number>();
  for (const item of myInventory) {
    stockMap.set(item.productId, (stockMap.get(item.productId) ?? 0) + item.quantity);
  }

  // All product IDs
  const allProductIds = [...new Set([
    ...recipes.flatMap((r) => r.outputs.map((o) => o.product.id)),
    ...recipes.flatMap((r) => r.inputs.map((i) => i.product.id)),
  ])];

  // NPC base prices
  const npcPrices = await prisma.npcDemand.groupBy({
    by: ["productId"],
    where: { productId: { in: allProductIds } },
    _avg: { referencePrice: true, baseUnitsPerDay: true },
  });
  const npcPriceMap = new Map(npcPrices.map((n) => [n.productId, {
    price: Number(n._avg.referencePrice ?? 0),
    demand: Number(n._avg.baseUnitsPerDay ?? 0),
  }]));

  // Market orders for saturation (supply vs demand)
  const openOrders = await prisma.marketOrder.groupBy({
    by: ["productId"],
    where: { type: "SELL", status: { in: ["OPEN", "PARTIALLY_FILLED"] }, expiresAt: { gt: new Date() }, productId: { in: allProductIds } },
    _sum: { quantityTotal: true },
    _avg: { pricePerUnit: true },
  });
  const openOrderMap = new Map(openOrders.map((o) => [o.productId, {
    supply: o._sum.quantityTotal ?? 0,
    avgPrice: Number(o._avg.pricePerUnit ?? 0),
  }]));

  const recipeRows = recipes
    .filter((r) => r.outputs.length > 0)
    .map((r) => {
      const mainOutput = r.outputs[0];
      const prod       = mainOutput.product;
      const outputQty  = mainOutput.quantityPerUnit;
      const npc        = npcPriceMap.get(prod.id) ?? { price: 0, demand: 0 };
      const market     = openOrderMap.get(prod.id);

      const outputPrice  = market?.avgPrice ?? npc.price;
      const grossRevenue = outputPrice * outputQty;

      const inputs = r.inputs.map((inp) => {
        const inpNpc    = npcPriceMap.get(inp.product.id) ?? { price: 0, demand: 0 };
        const wsPrice   = openOrderMap.get(inp.product.id)?.avgPrice ?? null;
        const bestPrice = Math.min(wsPrice ?? Infinity, inpNpc.price || Infinity);
        const lineCost  = (bestPrice === Infinity ? 0 : bestPrice) * inp.quantityPerUnit;
        return {
          productId:   inp.product.id,
          productName: inp.product.nameUa,
          productIcon: null,
          unit:        inp.product.unit,
          amount:      inp.quantityPerUnit,
          basePrice:   inpNpc.price,
          wsPrice:     wsPrice ?? null,
          wsStock:     stockMap.get(inp.product.id) ?? 0,
          bestPrice:   bestPrice === Infinity ? inpNpc.price : bestPrice,
          lineCost,
        };
      });

      const totalInputCost = inputs.reduce((s, i) => s + i.lineCost, 0);
      const grossMargin    = grossRevenue - totalInputCost;
      const marginPct      = grossRevenue > 0 ? (grossMargin / grossRevenue) * 100 : 0;
      const roi            = totalInputCost > 0 ? (grossMargin / totalInputCost) * 100 : null;

      // Market status
      const demand    = npc.demand;
      const supply    = Number(market?.supply ?? 0);
      const saturation = demand > 0 ? supply / demand : null;
      const status: "SURPLUS" | "DEFICIT" | "BALANCED" | "NO_DATA" =
        saturation === null ? "NO_DATA"
        : saturation > 1.25 ? "SURPLUS"
        : saturation < 0.75 ? "DEFICIT"
        : "BALANCED";

      const hasAllInputs = r.inputs.every((inp) => (stockMap.get(inp.product.id) ?? 0) >= inp.quantityPerUnit);

      return {
        id:           r.id,
        name:         r.name,
        category:     CAT_MAP[prod.category] ?? prod.category,
        outputProduct: { id: prod.id, name: prod.nameUa, unit: prod.unit, icon: null, basePrice: npc.price, category: prod.category },
        outputAmount:  outputQty,
        inputs,
        market: {
          retailPrice:  npc.price > 0 ? npc.price : null,
          saturation,
          status,
          retailSold:   0,
          priceVsBase:  npc.price > 0 ? outputPrice / npc.price : 1,
        },
        economics: { outputPrice, grossRevenue, totalInputCost, grossMargin, marginPct, roi },
        myLinesCount: myWorkshops.filter((w) => w.productionOrders.some((o) => o.recipeId === r.id)).length,
        isUsedByMe:   myRecipeIds.has(r.id),
        hasAllInputs,
      };
    });

  const profitable = recipeRows.filter((r) => r.economics.grossMargin > 0).length;
  const deficit    = recipeRows.filter((r) => r.market.status === "DEFICIT").length;
  const myRecipes  = recipeRows.filter((r) => r.isUsedByMe).length;

  return NextResponse.json({
    lastTickNumber: lastTick ? Number(lastTick.tickNumber) : null,
    recipes:        recipeRows,
    summary:        { total: recipeRows.length, profitable, deficit, myRecipes },
  });
}
