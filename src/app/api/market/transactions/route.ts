import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 50;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;
  const { searchParams } = new URL(req.url);
  const role = searchParams.get("role") ?? "all";
  const take = Math.min(100, Math.max(1, Number(searchParams.get("take") ?? PAGE_SIZE)));
  const skip = Math.max(0, Number(searchParams.get("skip") ?? 0));

  // Find orders belonging to player
  const myOrders = await prisma.marketOrder.findMany({
    where: { playerId },
    select: { id: true, type: true },
  });
  const mySellIds = myOrders.filter((o) => o.type === "SELL").map((o) => o.id);
  const myBuyIds  = myOrders.filter((o) => o.type === "BUY" ).map((o) => o.id);

  const where =
    role === "seller"
      ? { sellOrderId: { in: mySellIds } }
      : role === "buyer"
      ? { buyOrderId: { in: myBuyIds } }
      : { OR: [{ sellOrderId: { in: mySellIds } }, { buyOrderId: { in: myBuyIds } }] };

  const [total, trades] = await Promise.all([
    prisma.marketTrade.count({ where }),
    prisma.marketTrade.findMany({
      where,
      orderBy: { executedAt: "desc" },
      take,
      skip,
      select: {
        id: true, quantity: true, pricePerUnit: true, quality: true, executedAt: true,
        sellOrderId: true, buyOrderId: true,
        sellOrder: {
          select: {
            playerId: true,
            productId: true,
            product: { select: { nameUa: true, unit: true } },
          },
        },
        buyOrder: {
          select: {
            playerId: true,
            player: { select: { companyName: true } },
          },
        },
      },
    }),
  ]);

  // Get seller company names
  const sellerIds = [...new Set(trades.map((t) => t.sellOrder.playerId))];
  const sellers   = await prisma.player.findMany({
    where: { id: { in: sellerIds } },
    select: { id: true, companyName: true },
  });
  const sellerMap = new Map(sellers.map((s) => [s.id, s.companyName]));

  // Base prices
  const productIds = [...new Set(trades.map((t) => t.sellOrder.productId))];
  const npcPrices  = await prisma.npcDemand.groupBy({
    by: ["productId"],
    where: { productId: { in: productIds } },
    _avg: { referencePrice: true },
  });
  const basePriceMap = new Map(npcPrices.map((n) => [n.productId, Number(n._avg.referencePrice ?? 0)]));

  const transactions = trades.map((t) => {
    const isSeller       = mySellIds.includes(t.sellOrderId);
    const price          = Number(t.pricePerUnit);
    const qty            = t.quantity;
    const basePrice      = basePriceMap.get(t.sellOrder.productId) ?? price;
    const counterparty   = isSeller
      ? (t.buyOrder.player?.companyName ?? "Покупець")
      : (sellerMap.get(t.sellOrder.playerId) ?? "Продавець");

    return {
      id:           t.id,
      transactedAt: t.executedAt.toISOString(),
      productName:  t.sellOrder.product.nameUa,
      productUnit:  t.sellOrder.product.unit,
      basePrice,
      cityName:     "Україна",
      quantity:     qty,
      pricePerUnit: price,
      totalPrice:   qty * price,
      role:         isSeller ? "seller" : "buyer",
      counterparty,
    };
  });

  // Stats
  let totalEarned = 0, totalSpent = 0;
  let dealCount   = 0;

  // Aggregate all trades for this player (not just current page)
  const allSell = await prisma.marketTrade.aggregate({
    where: { sellOrderId: { in: mySellIds } },
    _sum: { quantity: true },
    _count: { id: true },
  });
  const allBuy  = await prisma.marketTrade.aggregate({
    where: { buyOrderId: { in: myBuyIds } },
    _sum: { quantity: true },
    _count: { id: true },
  });

  // Actually we need amounts, not qty. Group by order
  const sellTrades = await prisma.marketTrade.findMany({
    where: { sellOrderId: { in: mySellIds } },
    select: { quantity: true, pricePerUnit: true },
  });
  const buyTrades  = await prisma.marketTrade.findMany({
    where: { buyOrderId: { in: myBuyIds } },
    select: { quantity: true, pricePerUnit: true },
  });

  totalEarned = sellTrades.reduce((s, t) => s + t.quantity * Number(t.pricePerUnit), 0);
  totalSpent  = buyTrades.reduce((s, t) => s + t.quantity * Number(t.pricePerUnit), 0);
  dealCount   = (allSell._count.id) + (allBuy._count.id);

  // Day chart — last 14 days
  const since = new Date();
  since.setDate(since.getDate() - 14);
  const recentSell = await prisma.marketTrade.findMany({
    where: { sellOrderId: { in: mySellIds }, executedAt: { gte: since } },
    select: { executedAt: true, quantity: true, pricePerUnit: true },
  });
  const recentBuy = await prisma.marketTrade.findMany({
    where: { buyOrderId: { in: myBuyIds }, executedAt: { gte: since } },
    select: { executedAt: true, quantity: true, pricePerUnit: true },
  });

  const dayMap = new Map<string, { spent: number; earned: number; count: number }>();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const k = d.toISOString().slice(0, 10);
    dayMap.set(k, { spent: 0, earned: 0, count: 0 });
  }
  for (const t of recentSell) {
    const k = t.executedAt.toISOString().slice(0, 10);
    const e = dayMap.get(k) ?? { spent: 0, earned: 0, count: 0 };
    e.earned += t.quantity * Number(t.pricePerUnit); e.count++;
    dayMap.set(k, e);
  }
  for (const t of recentBuy) {
    const k = t.executedAt.toISOString().slice(0, 10);
    const e = dayMap.get(k) ?? { spent: 0, earned: 0, count: 0 };
    e.spent += t.quantity * Number(t.pricePerUnit); e.count++;
    dayMap.set(k, e);
  }
  const byDay = Array.from(dayMap.entries()).map(([date, v]) => ({ date, ...v }));

  // Top products
  const prodMap = new Map<string, { id: string; name: string; buyCount: number; sellCount: number; spent: number; earned: number }>();
  for (const t of sellTrades) {
    // We need product info — iterate from full trades list
  }
  // Use trade-level product grouping from already-fetched full list
  const allTradesWithProduct = await prisma.marketTrade.findMany({
    where: { OR: [{ sellOrderId: { in: mySellIds } }, { buyOrderId: { in: myBuyIds } }] },
    select: {
      quantity: true, pricePerUnit: true,
      sellOrderId: true, buyOrderId: true,
      sellOrder: { select: { productId: true, product: { select: { nameUa: true } } } },
    },
  });
  for (const t of allTradesWithProduct) {
    const pid  = t.sellOrder.productId;
    const name = t.sellOrder.product.nameUa;
    const amt  = t.quantity * Number(t.pricePerUnit);
    const isSl = mySellIds.includes(t.sellOrderId);
    const cur  = prodMap.get(pid) ?? { id: pid, name, buyCount: 0, sellCount: 0, spent: 0, earned: 0 };
    if (isSl) { cur.sellCount++; cur.earned += amt; }
    else       { cur.buyCount++;  cur.spent  += amt; }
    prodMap.set(pid, cur);
  }
  const topProducts = Array.from(prodMap.values())
    .map((p) => ({ ...p, total: p.earned + p.spent }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  return NextResponse.json({
    transactions,
    total,
    stats: {
      totalEarned: Math.round(totalEarned),
      totalSpent:  Math.round(totalSpent),
      netCashFlow: Math.round(totalEarned - totalSpent),
      dealCount,
      byDay,
      topProducts,
    },
  });
}
