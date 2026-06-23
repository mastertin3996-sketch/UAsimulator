import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;

  const rules = await prisma.replenishRule.findMany({
    where: { playerId },
    include: {
      enterprise: { select: { id: true, name: true } },
      product:    { select: { id: true, nameUa: true, unit: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // For each rule: get current enterprise inventory qty + min market price
  const productIds    = [...new Set(rules.map(r => r.productId))];
  const enterpriseIds = [...new Set(rules.map(r => r.enterpriseId))];

  const [inventories, marketOrders, npcPrices] = await Promise.all([
    prisma.enterpriseInventory.findMany({
      where: { enterpriseId: { in: enterpriseIds }, productId: { in: productIds } },
      select: { enterpriseId: true, productId: true, quantity: true },
    }),
    prisma.marketOrder.groupBy({
      by: ["productId"],
      where: {
        productId: { in: productIds },
        type:      "SELL",
        status:    { in: ["OPEN", "PARTIALLY_FILLED"] },
        expiresAt: { gt: new Date() },
      },
      _min:   { pricePerUnit: true },
      _count: { id: true },
    }),
    prisma.npcDemand.groupBy({
      by: ["productId"],
      where: { productId: { in: productIds } },
      _avg: { referencePrice: true },
    }),
  ]);

  const invMap   = new Map(inventories.map(i => [`${i.enterpriseId}:${i.productId}`, Number(i.quantity)]));
  const mktMap   = new Map(marketOrders.map(o => [o.productId, { min: Number(o._min.pricePerUnit ?? 0), count: o._count.id }]));
  const baseMap  = new Map(npcPrices.map(n => [n.productId, Number(n._avg.referencePrice ?? 0)]));

  const result = rules.map(r => ({
    id:              r.id,
    enterpriseId:    r.enterpriseId,
    enterpriseName:  r.enterprise.name,
    productId:       r.productId,
    productName:     r.product.nameUa,
    productUnit:     r.product.unit,
    basePrice:       baseMap.get(r.productId) ?? 0,
    isActive:        r.isActive,
    minStockTicks:   r.minStockTicks,
    maxPricePerUnit: Number(r.maxPricePerUnit),
    lastTriggeredAt: r.lastTriggeredAt?.toISOString() ?? null,
    currentQty:      invMap.get(`${r.enterpriseId}:${r.productId}`) ?? 0,
    minMarketPrice:  mktMap.get(r.productId)?.min ?? null,
    offersCount:     mktMap.get(r.productId)?.count ?? 0,
  }));

  return NextResponse.json({ rules: result });
}
