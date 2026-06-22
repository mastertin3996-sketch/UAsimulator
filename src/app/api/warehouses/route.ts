import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EnterpriseType } from "@prisma/client";

const TYPE_ICON: Record<EnterpriseType, string> = {
  OFFICE: "🏢", AGRO_FARM: "🌾", TEXTILE_FACTORY: "🧵",
  FOOD_PROCESSING: "🏭", RETAIL_STORE: "🏪",
  WAREHOUSE: "📦", LOGISTICS_HUB: "🚛", RD_LABORATORY: "🔬",
};

const TYPE_CAT: Record<EnterpriseType, string> = {
  OFFICE: "PRODUCTION", AGRO_FARM: "EXTRACTION",
  TEXTILE_FACTORY: "PRODUCTION", FOOD_PROCESSING: "PRODUCTION",
  RETAIL_STORE: "TRADE", WAREHOUSE: "LOGISTICS",
  LOGISTICS_HUB: "LOGISTICS", RD_LABORATORY: "PRODUCTION",
};

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;

  const enterprises = await prisma.enterprise.findMany({
    where: { playerId },
    select: {
      id: true, name: true, type: true,
      landPlot: { select: { city: { select: { nameUa: true } } } },
      inventory: {
        where: { quantity: { gt: 0 } },
        orderBy: { quantity: "desc" },
        select: {
          quantity: true, avgQuality: true,
          product: { select: { id: true, nameUa: true, unit: true } },
        },
      },
    },
    orderBy: { id: "asc" },
  });

  // Get base prices (NPC reference prices averaged across cities)
  const productIds = [...new Set(
    enterprises.flatMap((e) => e.inventory.map((i) => i.product.id))
  )];

  const npcPrices = await prisma.npcDemand.groupBy({
    by: ["productId"],
    where: { productId: { in: productIds } },
    _avg: { referencePrice: true },
  });
  const basePriceMap = new Map(npcPrices.map((n) => [n.productId, Number(n._avg.referencePrice ?? 0)]));

  // Warehouses (WAREHOUSE type enterprises)
  const warehouses = await prisma.warehouse.findMany({
    where: { playerId },
    select: {
      id: true, maxVolumeM3: true, usedVolumeM3: true,
      enterprise: { select: { name: true } },
      city: { select: { nameUa: true } },
    },
  });

  const entGroups = enterprises.map((e) => ({
    id: e.id, name: e.name,
    category: TYPE_CAT[e.type],
    icon: TYPE_ICON[e.type],
    cityName: e.landPlot.city.nameUa,
    items: e.inventory.map((i) => ({
      productId:   i.product.id,
      productName: i.product.nameUa,
      unit:        i.product.unit,
      quantity:    i.quantity,
      quality:     i.avgQuality,
      avgCost:     0,
      basePrice:   basePriceMap.get(i.product.id) ?? 0,
      reservedQty: 0,
      autoSellQty: 0, autoSellPrice: null,
    })),
  }));

  // Summary: aggregate across all enterprises
  const summaryMap = new Map<string, { productName: string; unit: string; basePrice: number; totalQty: number; totalValue: number }>();
  for (const ent of entGroups) {
    for (const item of ent.items) {
      if (!summaryMap.has(item.productId)) {
        summaryMap.set(item.productId, {
          productName: item.productName, unit: item.unit,
          basePrice: item.basePrice, totalQty: 0, totalValue: 0,
        });
      }
      const s = summaryMap.get(item.productId)!;
      s.totalQty   += item.quantity;
      s.totalValue += item.quantity * item.basePrice;
    }
  }

  const summary = Array.from(summaryMap.entries())
    .map(([productId, s]) => ({ productId, ...s }))
    .sort((a, b) => b.totalValue - a.totalValue);

  const warehouseMap: Record<string, {
    id: string; name: string; cityName: string; capacity: number; usedCapacity: number; items: never[];
  }> = {};
  for (const w of warehouses) {
    warehouseMap[w.id] = {
      id: w.id, name: w.enterprise.name,
      cityName: w.city.nameUa,
      capacity: w.maxVolumeM3, usedCapacity: w.usedVolumeM3, items: [],
    };
  }

  return NextResponse.json({ enterprises: entGroups, warehouses: warehouseMap, summary });
}
