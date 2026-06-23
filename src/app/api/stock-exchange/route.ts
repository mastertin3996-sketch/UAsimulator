import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;

  const [player, tickers, myOrders, myShares, myTicker] = await Promise.all([
    prisma.player.findUniqueOrThrow({
      where: { id: playerId },
      select: {
        cashBalance: true, companyValuationUah: true,
        isBankrupt: true, companyName: true,
      },
    }),
    prisma.stockTicker.findMany({
      where: { isActive: true },
      select: {
        id: true, symbol: true, playerId: true,
        totalSharesIssued: true, freeFloatShares: true,
        lastTradedPriceUah: true, marketCapUah: true,
        targetValuationUah: true, ipoExecutedAtTick: true,
        player: { select: { companyName: true } },
      },
      orderBy: { marketCapUah: "desc" },
    }),
    prisma.stockOrderBook.findMany({
      where: { placedByPlayerId: playerId, status: { in: ["OPEN", "PARTIALLY_FILLED"] } },
      select: {
        id: true, tickerId: true, type: true,
        pricePerShareUah: true, quantity: true, filledQuantity: true,
        status: true, createdAtTick: true,
        ticker: { select: { symbol: true } },
      },
      orderBy: { createdAtTick: "desc" },
    }),
    prisma.shareholderRegistry.findMany({
      where: { playerId },
      select: {
        sharesCount: true, tickerId: true,
        ticker: { select: { symbol: true, lastTradedPriceUah: true } },
      },
    }),
    prisma.stockTicker.findUnique({
      where: { playerId },
      select: {
        id: true, symbol: true, totalSharesIssued: true,
        freeFloatShares: true, lastTradedPriceUah: true,
        marketCapUah: true, ipoExecutedAtTick: true, isActive: true,
      },
    }),
  ]);

  // Portfolio value
  const portfolioValue = myShares.reduce((sum, s) => {
    return sum + Number(s.sharesCount) * Number(s.ticker.lastTradedPriceUah);
  }, 0);

  return NextResponse.json({
    player: {
      cashBalance: Number(player.cashBalance),
      companyValuationUah: Number(player.companyValuationUah),
      isBankrupt: player.isBankrupt,
      companyName: player.companyName,
    },
    myTicker: myTicker ? {
      id: myTicker.id,
      symbol: myTicker.symbol,
      totalSharesIssued: Number(myTicker.totalSharesIssued),
      freeFloatShares: Number(myTicker.freeFloatShares),
      lastTradedPriceUah: Number(myTicker.lastTradedPriceUah),
      marketCapUah: Number(myTicker.marketCapUah),
      ipoExecutedAtTick: Number(myTicker.ipoExecutedAtTick),
      isActive: myTicker.isActive,
    } : null,
    tickers: tickers.map(t => ({
      id: t.id,
      symbol: t.symbol,
      companyName: t.player.companyName,
      isOwn: t.playerId === playerId,
      totalSharesIssued: Number(t.totalSharesIssued),
      freeFloatShares: Number(t.freeFloatShares),
      lastTradedPriceUah: Number(t.lastTradedPriceUah),
      marketCapUah: Number(t.marketCapUah),
      ipoExecutedAtTick: Number(t.ipoExecutedAtTick),
    })),
    myOrders: myOrders.map(o => ({
      id: o.id,
      tickerId: o.tickerId,
      symbol: o.ticker.symbol,
      type: o.type,
      pricePerShareUah: Number(o.pricePerShareUah),
      quantity: Number(o.quantity),
      filledQuantity: Number(o.filledQuantity),
      status: o.status,
      createdAtTick: Number(o.createdAtTick),
    })),
    myShares: myShares.map(s => ({
      tickerId: s.tickerId,
      symbol: s.ticker.symbol,
      sharesCount: Number(s.sharesCount),
      lastPriceUah: Number(s.ticker.lastTradedPriceUah),
      value: Number(s.sharesCount) * Number(s.ticker.lastTradedPriceUah),
    })),
    portfolioValue,
  });
}
