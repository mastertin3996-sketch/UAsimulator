import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 30;

const financesQuerySchema = z.object({
  page: z.coerce.number().finite().optional(),
  type: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;
  const { searchParams } = new URL(req.url);
  const parsed = financesQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Некоректні параметри запиту" }, { status: 400 });
  }
  const page     = Math.max(1, Number(parsed.data.page ?? 1));
  const typeFilter = parsed.data.type ?? "";

  // Transactions (paginated)
  const where = {
    playerId,
    ...(typeFilter ? { type: typeFilter as never } : {}),
  };

  const [total, txns] = await Promise.all([
    prisma.financialTransaction.count({ where }),
    prisma.financialTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip:  (page - 1) * PAGE_SIZE,
      take:  PAGE_SIZE,
      select: {
        id: true, type: true, amountUah: true, balanceBefore: true, balanceAfter: true,
        description: true, createdAt: true,
      },
    }),
  ]);

  // Aggregate income / expenses
  const statsAgg = await prisma.financialTransaction.aggregate({
    where: { playerId },
    _sum: { amountUah: true },
  });

  const incomeAgg = await prisma.financialTransaction.aggregate({
    where: { playerId, amountUah: { gt: 0 } },
    _sum: { amountUah: true },
  });

  const expenseAgg = await prisma.financialTransaction.aggregate({
    where: { playerId, amountUah: { lt: 0 } },
    _sum: { amountUah: true },
  });

  const totalIncome   = Number(incomeAgg._sum.amountUah ?? 0);
  const totalExpenses = Math.abs(Number(expenseAgg._sum.amountUah ?? 0));
  const totalProfit   = Number(statsAgg._sum.amountUah ?? 0);

  // Chart data from DailySnapshots
  const snapshots = await prisma.dailySnapshot.findMany({
    where: { playerId },
    orderBy: { tickNumber: "asc" },
    take: 20,
    select: { tickNumber: true, revenueUah: true, opexUah: true, netProfitUah: true },
  });

  const chartData = snapshots.map((s) => ({
    tick:     Number(s.tickNumber),
    revenue:  Number(s.revenueUah),
    expenses: Number(s.opexUah),
    profit:   Number(s.netProfitUah),
  }));

  // Category breakdown from FinancialLog
  const logGroups = await prisma.financialLog.groupBy({
    by: ["category"],
    where: { playerId },
    _sum: { amountUah: true },
  });

  const byCategory = logGroups.map((g) => {
    const amt = Number(g._sum.amountUah ?? 0);
    return {
      type:    g.category,
      income:  amt > 0 ? amt : 0,
      expense: amt < 0 ? Math.abs(amt) : 0,
      net:     amt,
    };
  });

  return NextResponse.json({
    txns: txns.map((t) => ({
      id:          t.id,
      type:        t.type,
      currency:    "UAH",
      amount:      Number(t.amountUah),
      balanceAfter: Number(t.balanceAfter),
      description: t.description ?? null,
      createdAt:   t.createdAt.toISOString(),
      tickNumber:  null,
    })),
    total,
    page,
    pages: Math.ceil(total / PAGE_SIZE),
    stats: { totalIncome, totalExpenses, totalProfit },
    chartData,
    byCategory,
  });
}
