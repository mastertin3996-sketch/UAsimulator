import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Most traded products by volume
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const trades = await prisma.marketTrade.findMany({
    where: { executedAt: { gte: since } },
    select: {
      quantity: true, pricePerUnit: true, executedAt: true,
      sellOrder: { select: { productId: true, product: { select: { nameUa: true, unit: true } } } },
    },
  });

  // Group by product
  const prodMap = new Map<string, {
    productId: string; name: string; unit: string;
    totalQty: number; totalValue: number; count: number;
    prices: number[];
  }>();
  for (const t of trades) {
    const pid  = t.sellOrder.productId;
    const name = t.sellOrder.product.nameUa;
    const unit = t.sellOrder.product.unit;
    const cur  = prodMap.get(pid) ?? { productId: pid, name, unit, totalQty: 0, totalValue: 0, count: 0, prices: [] };
    cur.totalQty   += t.quantity;
    cur.totalValue += t.quantity * Number(t.pricePerUnit);
    cur.count++;
    cur.prices.push(Number(t.pricePerUnit));
    prodMap.set(pid, cur);
  }

  const npcPrices = await prisma.npcDemand.groupBy({
    by: ["productId"],
    where: { productId: { in: [...prodMap.keys()] } },
    _avg: { referencePrice: true },
  });
  const basePriceMap = new Map(npcPrices.map((n) => [n.productId, Number(n._avg.referencePrice ?? 0)]));

  const trends = Array.from(prodMap.values())
    .map((p) => {
      const avgPrice   = p.totalQty > 0 ? p.totalValue / p.totalQty : 0;
      const basePrice  = basePriceMap.get(p.productId) ?? avgPrice;
      const sortedPrices = p.prices.sort((a, b) => a - b);
      const firstHalf    = sortedPrices.slice(0, Math.floor(sortedPrices.length / 2));
      const secondHalf   = sortedPrices.slice(Math.floor(sortedPrices.length / 2));
      const priceChange  = firstHalf.length && secondHalf.length
        ? (secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length)
          / (firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length) - 1
        : 0;
      return {
        productId:   p.productId,
        name:        p.name,
        unit:        p.unit,
        avgPrice,
        basePrice,
        priceVsBase: basePrice > 0 ? avgPrice / basePrice : 1,
        priceChange,
        volume:      Math.round(p.totalQty),
        tradeCount:  p.count,
      };
    })
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 30);

  return NextResponse.json({ trends, period: "30d" });
}
