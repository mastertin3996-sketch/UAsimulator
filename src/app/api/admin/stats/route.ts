import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [
    playerCount,
    enterpriseCount,
    orderCount,
    lastTicks,
    players,
    totalTrades,
    bankruptCount,
    frozenCount,
  ] = await Promise.all([
    prisma.player.count(),
    prisma.enterprise.count({ where: { isOperational: true } }),
    prisma.marketOrder.count({ where: { status: "OPEN" } }),
    prisma.gameTick.findMany({
      orderBy: { tickNumber: "desc" },
      take: 20,
      select: { tickNumber: true, durationMs: true, startedAt: true, completedAt: true },
    }),
    prisma.player.findMany({
      orderBy: { netWorth: "desc" },
      select: {
        id: true, username: true, companyName: true,
        cashBalance: true, balanceUsd: true, netWorth: true,
        creditRating: true, reputationScore: true,
        isBankrupt: true, isOperationsFrozen: true,
        _count: { select: { enterprises: true } },
      },
    }),
    prisma.marketTrade.count(),
    prisma.player.count({ where: { isBankrupt: true } }),
    prisma.player.count({ where: { isOperationsFrozen: true } }),
  ]);

  const currentTick = lastTicks[0]?.tickNumber ?? BigInt(0);
  const avgTickMs   = lastTicks.length
    ? lastTicks.reduce((s, t) => s + (t.durationMs ?? 0), 0) / lastTicks.length
    : 0;

  return NextResponse.json({
    overview: {
      currentTick:     Number(currentTick),
      playerCount,
      enterpriseCount,
      openOrderCount:  orderCount,
      totalTrades,
      bankruptCount,
      frozenCount,
      avgTickMs:       Math.round(avgTickMs),
    },
    recentTicks: lastTicks.map((t) => ({
      tickNumber:  Number(t.tickNumber),
      durationMs:  t.durationMs,
      startedAt:   t.startedAt?.toISOString() ?? null,
      completedAt: t.completedAt?.toISOString() ?? null,
    })),
    players: players.map((p) => ({
      id:                  p.id,
      username:            p.username,
      companyName:         p.companyName,
      cashBalance:         Number(p.cashBalance),
      balanceUsd:          Number(p.balanceUsd),
      netWorth:            Number(p.netWorth),
      creditRating:        Number(p.creditRating),
      reputationScore:     Number(p.reputationScore),
      isBankrupt:          p.isBankrupt,
      isOperationsFrozen:  p.isOperationsFrozen,
      enterpriseCount:     p._count.enterprises,
    })),
  });
}
