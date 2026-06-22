import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const productId = new URL(req.url).searchParams.get("productId");
  if (!productId) return NextResponse.json({ error: "productId required" }, { status: 400 });

  const since = new Date();
  since.setDate(since.getDate() - 60);

  const trades = await prisma.marketTrade.findMany({
    where: {
      executedAt: { gte: since },
      sellOrder: { productId },
    },
    select: { quantity: true, pricePerUnit: true, executedAt: true },
    orderBy: { executedAt: "asc" },
  });

  // Group by day
  const dayMap = new Map<string, { date: string; prices: number[]; qty: number }>();
  for (const t of trades) {
    const day = t.executedAt.toISOString().slice(0, 10);
    const cur = dayMap.get(day) ?? { date: day, prices: [], qty: 0 };
    cur.prices.push(Number(t.pricePerUnit));
    cur.qty += t.quantity;
    dayMap.set(day, cur);
  }

  const priceHistory = Array.from(dayMap.values()).map((d) => ({
    date:     d.date,
    avgPrice: d.prices.reduce((s, v) => s + v, 0) / d.prices.length,
    minPrice: Math.min(...d.prices),
    maxPrice: Math.max(...d.prices),
    volume:   Math.round(d.qty),
    count:    d.prices.length,
  }));

  // Base price
  const npc = await prisma.npcDemand.aggregate({
    where: { productId },
    _avg: { referencePrice: true },
  });
  const basePrice = Number(npc._avg.referencePrice ?? 0);

  // Current open orders
  const openOrders = await prisma.marketOrder.findMany({
    where: { productId, type: "SELL", status: { in: ["OPEN", "PARTIALLY_FILLED"] }, expiresAt: { gt: new Date() } },
    select: { pricePerUnit: true, quantityTotal: true, quantityFilled: true },
    orderBy: { pricePerUnit: "asc" },
    take: 20,
  });

  const orderBook = openOrders.map((o) => ({
    price:    Number(o.pricePerUnit),
    qty:      o.quantityTotal - o.quantityFilled,
  }));

  return NextResponse.json({ priceHistory, basePrice, orderBook });
}
