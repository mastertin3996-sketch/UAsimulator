import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 50;

// Income types (positive amount)
const INCOME_TYPES = new Set(["RETAIL_SALE", "MARKET_SALE", "DEPOSIT", "CONTRACT_EXECUTED"]);

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const type     = searchParams.get("type") ?? "";
  const currency = searchParams.get("currency") ?? "";
  const page     = Math.max(1, Number(searchParams.get("page") ?? 1));

  const company = await prisma.company.findFirst({
    where: { ownerId: session.user.id },
    select: { id: true },
  });
  if (!company) return NextResponse.json({ error: "No company" }, { status: 404 });

  const where: Record<string, unknown> = { companyId: company.id };
  if (type)     where.type     = type;
  if (currency) where.currency = currency;

  const [total, txns] = await Promise.all([
    prisma.financialTransaction.count({ where }),
    prisma.financialTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true, type: true, currency: true,
        amount: true, balanceAfter: true,
        description: true, createdAt: true,
        tick: { select: { tickNumber: true } },
      },
    }),
  ]);

  // All GAME_CASH transactions for aggregation (chart + categories)
  const allTxns = await prisma.financialTransaction.findMany({
    where   : { companyId: company.id, currency: "GAME_CASH" },
    select  : { type: true, amount: true, tick: { select: { tickNumber: true } } },
    orderBy : { createdAt: "asc" },
  });

  let totalIncome = 0, totalExpenses = 0;
  const tickMap    = new Map<number, { tick: number; revenue: number; expenses: number }>();
  const categoryMap = new Map<string, { income: number; expense: number }>();

  for (const t of allTxns) {
    const amt  = Number(t.amount);
    const tNum = t.tick?.tickNumber ?? 0;

    // Tick chart
    if (!tickMap.has(tNum)) tickMap.set(tNum, { tick: tNum, revenue: 0, expenses: 0 });
    const entry = tickMap.get(tNum)!;

    // Category map
    if (!categoryMap.has(t.type)) categoryMap.set(t.type, { income: 0, expense: 0 });
    const cat = categoryMap.get(t.type)!;

    if (amt > 0) {
      totalIncome += amt;
      entry.revenue += amt;
      cat.income += amt;
    } else {
      const abs = Math.abs(amt);
      totalExpenses += abs;
      entry.expenses += abs;
      cat.expense += abs;
    }
  }

  const chartData = Array.from(tickMap.values())
    .sort((a, b) => a.tick - b.tick)
    .slice(-20)
    .map((d) => ({ ...d, profit: d.revenue - d.expenses }));

  const byCategory = Array.from(categoryMap.entries())
    .map(([type, v]) => ({ type, ...v, net: v.income - v.expense }))
    .sort((a, b) => (b.income + b.expense) - (a.income + a.expense));

  return NextResponse.json({
    txns: txns.map((t) => ({
      id          : t.id,
      type        : t.type,
      currency    : t.currency,
      amount      : Number(t.amount),
      balanceAfter: Number(t.balanceAfter),
      description : t.description,
      createdAt   : t.createdAt,
      tickNumber  : t.tick?.tickNumber ?? null,
    })),
    total,
    page,
    pages: Math.ceil(total / PAGE_SIZE),
    stats: {
      totalIncome,
      totalExpenses,
      totalProfit: totalIncome - totalExpenses,
    },
    chartData,
    byCategory,
  });
}
