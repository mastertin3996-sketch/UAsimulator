import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/wallet — GC balance history, recent transactions, income/expense stats
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const company = await prisma.company.findFirst({
    where : { ownerId: session.user.id },
    select: { id: true },
  });
  if (!company) return NextResponse.json({ error: "No company" }, { status: 404 });

  // Recent GAME_CASH transactions for history + stats
  const recentTxns = await prisma.financialTransaction.findMany({
    where  : { companyId: company.id, currency: "GAME_CASH" },
    orderBy: { createdAt: "desc" },
    take   : 100,
    select : {
      id          : true,
      type        : true,
      amount      : true,
      balanceAfter: true,
      description : true,
      createdAt   : true,
      tick        : { select: { tickNumber: true } },
    },
  });

  // Balance sparkline: last point per tick (sorted asc)
  const tickBalance = new Map<number, number>();
  for (const t of recentTxns) {
    const tNum = t.tick?.tickNumber ?? 0;
    if (!tickBalance.has(tNum)) {
      tickBalance.set(tNum, Number(t.balanceAfter));
    }
  }
  const balanceHistory = Array.from(tickBalance.entries())
    .sort(([a], [b]) => a - b)
    .slice(-20)
    .map(([tick, balance]) => ({ tick, balance }));

  // Stats from last 10 ticks
  const INCOME_TYPES = new Set(["RETAIL_SALE", "MARKET_SALE", "DEPOSIT", "CONTRACT_EXECUTED"]);
  let recentIncome = 0, recentExpense = 0;
  const recentTickNums = new Set(
    recentTxns.slice(0, 50).map((t) => t.tick?.tickNumber ?? 0).filter((n) => n > 0)
  );
  const last10Ticks = Array.from(recentTickNums).sort((a, b) => b - a).slice(0, 10);
  const last10Set = new Set(last10Ticks);

  for (const t of recentTxns) {
    const tNum = t.tick?.tickNumber ?? 0;
    if (!last10Set.has(tNum)) continue;
    const amt = Number(t.amount);
    if (amt > 0) recentIncome  += amt;
    else         recentExpense += Math.abs(amt);
  }

  const avgIncomePerTick  = last10Ticks.length > 0 ? recentIncome  / last10Ticks.length : 0;
  const avgExpensePerTick = last10Ticks.length > 0 ? recentExpense / last10Ticks.length : 0;

  // Last 20 transactions for display (already sorted desc)
  const latestTxns = recentTxns.slice(0, 20).map((t) => ({
    id         : t.id,
    type       : t.type,
    amount     : Number(t.amount),
    balanceAfter: Number(t.balanceAfter),
    description: t.description,
    createdAt  : t.createdAt,
    tickNumber : t.tick?.tickNumber ?? null,
  }));

  return NextResponse.json({
    balanceHistory,
    latestTxns,
    stats: {
      avgIncomePerTick : Math.round(avgIncomePerTick),
      avgExpensePerTick: Math.round(avgExpensePerTick),
      avgNetPerTick    : Math.round(avgIncomePerTick - avgExpensePerTick),
      ticksAnalyzed    : last10Ticks.length,
    },
  });
}
