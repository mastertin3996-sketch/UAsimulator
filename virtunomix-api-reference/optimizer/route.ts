import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cache, TTL_ANALYTICS } from "@/lib/cache";

// ─── GET /api/optimizer ────────────────────────────────────────────────────────
// Returns profitability analysis for all production recipes using current market prices.
// Output price  = last-tick avg retail price (or base price if no retail data).
// Input price   = avg active wholesale offer price (or base price if no offers).
// Margin        = outputQty × outputPrice − Σ(inputQty × inputPrice)

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cacheKey = `optimizer:${session.user.id}`;
  const hit = cache.get<object>(cacheKey);
  if (hit) return NextResponse.json(hit, { headers: { "X-Cache": "HIT" } });

  // ── User's company ───────────────────────────────────────────────────────────
  const company = await prisma.company.findFirst({
    where: { ownerId: session.user.id },
    select: { id: true },
  });

  // ── Recipes with inputs ──────────────────────────────────────────────────────
  const recipes = await prisma.productionRecipe.findMany({
    select: {
      id: true, name: true, outputAmount: true, enterpriseCategory: true, enterpriseTypeId: true,
      outputProduct: { select: { id: true, name: true, unit: true, basePrice: true, icon: true, category: { select: { name: true } } } },
      inputs: {
        select: {
          amount : true,
          product: { select: { id: true, name: true, unit: true, basePrice: true, icon: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  // Collect all product IDs referenced by recipes
  const allProductIds = new Set<string>();
  for (const r of recipes) {
    allProductIds.add(r.outputProduct.id);
    for (const inp of r.inputs) allProductIds.add(inp.product.id);
  }
  const productIdList = Array.from(allProductIds);

  // ── Last completed tick ──────────────────────────────────────────────────────
  const lastTick = await prisma.gameTick.findFirst({
    where  : { status: "DONE" },
    orderBy: { tickNumber: "desc" },
    select : { id: true, tickNumber: true },
  });

  // ── Retail prices + saturation (latest tick) ─────────────────────────────────
  const retailAgg = lastTick
    ? await prisma.retailSalesLog.groupBy({
        by   : ["productId"],
        where: { tickId: lastTick.id, productId: { in: productIdList } },
        _avg : { price: true, saturationIndex: true },
        _sum : { quantitySold: true },
      })
    : [];
  const retailMap = new Map(retailAgg.map((r) => [r.productId, r]));

  // ── Wholesale prices: avg active offer price per product ──────────────────────
  const wholesaleAgg = await prisma.marketOffer.groupBy({
    by   : ["productId"],
    where: { status: "ACTIVE", productId: { in: productIdList } },
    _avg : { price: true },
    _sum : { quantity: true },
  });
  const wholesaleMap = new Map(wholesaleAgg.map((o) => [o.productId, o]));

  // ── User's production lines (recipes in use) ──────────────────────────────────
  type LineInfo = { recipeId: string; count: number };
  const myLines: LineInfo[] = [];
  if (company) {
    const lines = await prisma.productionLine.findMany({
      where: {
        recipeId: { not: null },
        isActive: true,
        workshop: { office: { enterprise: { companyId: company.id } } },
      },
      select: { recipeId: true },
    });
    const lineMap = new Map<string, number>();
    for (const l of lines) {
      if (l.recipeId) lineMap.set(l.recipeId, (lineMap.get(l.recipeId) ?? 0) + 1);
    }
    for (const [recipeId, count] of lineMap) myLines.push({ recipeId, count });
  }
  const myLineMap = new Map(myLines.map((l) => [l.recipeId, l.count]));

  // ── Build result ──────────────────────────────────────────────────────────────
  const result = recipes.map((recipe) => {
    const outProd   = recipe.outputProduct;
    const outQty    = Number(recipe.outputAmount);

    // Output price
    const retailData    = retailMap.get(outProd.id);
    const outRetailPrice = retailData?._avg.price != null ? Number(retailData._avg.price) : null;
    const outBasePrice   = Number(outProd.basePrice);
    const outPrice       = outRetailPrice ?? outBasePrice;
    const saturation     = retailData?._avg.saturationIndex != null ? Number(retailData._avg.saturationIndex) : null;
    const retailSold     = retailData?._sum.quantitySold != null ? Number(retailData._sum.quantitySold) : 0;

    const status =
      saturation === null ? "NO_DATA"
      : saturation > 1.25  ? "SURPLUS"
      : saturation < 0.75  ? "DEFICIT"
      : "BALANCED";

    // Input costs
    const inputs = recipe.inputs.map((inp) => {
      const inProd     = inp.product;
      const inQty      = Number(inp.amount);
      const wsData     = wholesaleMap.get(inProd.id);
      const wsPrice    = wsData?._avg.price != null ? Number(wsData._avg.price) : null;
      const wsStock    = wsData?._sum.quantity != null ? Number(wsData._sum.quantity) : 0;
      const inBasePrice = Number(inProd.basePrice);
      const bestPrice  = wsPrice ?? inBasePrice;

      return {
        productId  : inProd.id,
        productName: inProd.name,
        productIcon: inProd.icon,
        unit       : inProd.unit,
        amount     : inQty,
        basePrice  : inBasePrice,
        wsPrice,
        wsStock,
        bestPrice,
        lineCost   : inQty * bestPrice,
      };
    });

    const totalInputCost = inputs.reduce((s, i) => s + i.lineCost, 0);
    const grossRevenue   = outQty * outPrice;
    const grossMargin    = grossRevenue - totalInputCost;
    const marginPct      = grossRevenue > 0 ? (grossMargin / grossRevenue) * 100 : 0;
    const roi            = totalInputCost > 0 ? (grossMargin / totalInputCost) * 100 : null;

    const myLinesCount = myLineMap.get(recipe.id) ?? 0;

    return {
      id                : recipe.id,
      name              : recipe.name,
      category          : recipe.enterpriseCategory,
      outputProduct     : {
        id   : outProd.id,
        name : outProd.name,
        unit : outProd.unit,
        icon : outProd.icon,
        basePrice: outBasePrice,
        category : outProd.category.name,
      },
      outputAmount      : outQty,
      inputs,
      market: {
        retailPrice   : outRetailPrice,
        saturation,
        status,
        retailSold,
        priceVsBase   : outPrice / outBasePrice,
      },
      economics: {
        outputPrice   : outPrice,
        grossRevenue,
        totalInputCost,
        grossMargin,
        marginPct,
        roi,
      },
      myLinesCount,
      isUsedByMe        : myLinesCount > 0,
      hasAllInputs      : inputs.every((i) => i.wsStock > 0 || i.wsPrice === null),
    };
  });

  // Sort default: grossMargin desc
  result.sort((a, b) => b.economics.grossMargin - a.economics.grossMargin);

  const profitableCount = result.filter((r) => r.economics.grossMargin > 0).length;
  const deficitCount    = result.filter((r) => r.market.status === "DEFICIT").length;
  const myRecipeCount   = result.filter((r) => r.isUsedByMe).length;

  const body = {
    lastTickNumber: lastTick?.tickNumber ?? null,
    recipes       : result,
    summary       : { total: result.length, profitable: profitableCount, deficit: deficitCount, myRecipes: myRecipeCount },
  };

  cache.set(cacheKey, body, TTL_ANALYTICS);
  return NextResponse.json(body, { headers: { "X-Cache": "MISS" } });
}
