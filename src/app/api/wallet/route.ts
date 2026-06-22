import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;

  // Balance history from DailySnapshots
  const snapshots = await prisma.dailySnapshot.findMany({
    where: { playerId },
    orderBy: { tickNumber: "asc" },
    take: 30,
    select: { tickNumber: true, cashBalance: true },
  });

  const balanceHistory = snapshots.map((s) => ({
    tick:    Number(s.tickNumber),
    balance: Number(s.cashBalance),
  }));

  // Latest financial transactions
  const txns = await prisma.financialTransaction.findMany({
    where: { playerId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, type: true, amountUah: true, balanceAfter: true, description: true, createdAt: true },
  });

  const latestTxns = txns.map((t) => ({
    id:           t.id,
    type:         t.type,
    amount:       Number(t.amountUah),
    balanceAfter: Number(t.balanceAfter),
    description:  t.description ?? null,
    createdAt:    t.createdAt.toISOString(),
    tickNumber:   null,
  }));

  // Stats: avg income / expense per tick from recent snapshots
  const recentSnaps = await prisma.dailySnapshot.findMany({
    where: { playerId },
    orderBy: { tickNumber: "desc" },
    take: 10,
    select: { revenueUah: true, opexUah: true, netProfitUah: true },
  });

  let avgIncomePerTick = 0, avgExpensePerTick = 0, avgNetPerTick = 0;
  if (recentSnaps.length > 0) {
    avgIncomePerTick  = recentSnaps.reduce((s, n) => s + Number(n.revenueUah), 0) / recentSnaps.length;
    avgExpensePerTick = recentSnaps.reduce((s, n) => s + Number(n.opexUah), 0) / recentSnaps.length;
    avgNetPerTick     = recentSnaps.reduce((s, n) => s + Number(n.netProfitUah), 0) / recentSnaps.length;
  }

  return NextResponse.json({
    balanceHistory,
    latestTxns,
    stats: {
      avgIncomePerTick:  Math.round(avgIncomePerTick),
      avgExpensePerTick: Math.round(avgExpensePerTick),
      avgNetPerTick:     Math.round(avgNetPerTick),
      ticksAnalyzed:     recentSnaps.length,
    },
  });
}
