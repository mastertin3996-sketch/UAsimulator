import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Active market orders summary
  const openOrders = await prisma.marketOrder.groupBy({
    by: ["productId"],
    where: { type: "SELL", status: { in: ["OPEN", "PARTIALLY_FILLED"] }, expiresAt: { gt: new Date() } },
    _sum: { quantityTotal: true },
    _count: { id: true },
    _avg: { pricePerUnit: true },
  });

  const productIds = openOrders.map((o) => o.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, nameUa: true, unit: true },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  const npcPrices = await prisma.npcDemand.groupBy({
    by: ["productId"],
    where: { productId: { in: productIds } },
    _avg: { referencePrice: true },
  });
  const basePriceMap = new Map(npcPrices.map((n) => [n.productId, Number(n._avg.referencePrice ?? 0)]));

  const marketSummary = openOrders.map((o) => {
    const prod      = productMap.get(o.productId);
    const basePrice = basePriceMap.get(o.productId) ?? 0;
    const avgPrice  = Number(o._avg.pricePerUnit ?? 0);
    return {
      productId:      o.productId,
      productName:    prod?.nameUa ?? o.productId,
      unit:           prod?.unit ?? "шт",
      totalQty:       o._sum.quantityTotal ?? 0,
      orderCount:     o._count.id,
      avgPrice,
      basePrice,
      priceVsBase:    basePrice > 0 ? avgPrice / basePrice : 1,
    };
  }).sort((a, b) => b.totalQty - a.totalQty);

  // Recent trade volume
  const since = new Date();
  since.setDate(since.getDate() - 7);
  const recentTrades = await prisma.marketTrade.groupBy({
    by: ["sellOrderId"],
    where: { executedAt: { gte: since } },
    _sum: { quantity: true },
    _count: { id: true },
  });
  const tradeVolume = recentTrades.reduce((s, t) => s + (t._sum.quantity ?? 0), 0);
  const tradeCount  = recentTrades.reduce((s, t) => s + t._count.id, 0);

  return NextResponse.json({
    marketSummary,
    stats: {
      totalListings: openOrders.reduce((s, o) => s + o._count.id, 0),
      uniqueProducts: openOrders.length,
      weekTradeVolume: Math.round(tradeVolume),
      weekTradeCount: tradeCount,
    },
  });
}
