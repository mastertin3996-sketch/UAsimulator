import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;

  const [player, lastTick] = await Promise.all([
    prisma.player.findUnique({
      where:  { id: playerId },
      select: {
        id: true, companyName: true, cashBalance: true, balanceUsd: true,
        netWorth: true, creditRating: true, reputationScore: true,
        insolvencyTickCount: true, isOperationsFrozen: true, isBankrupt: true,
        companyValuationUah: true,
      },
    }),
    prisma.gameTick.findFirst({
      orderBy: { tickNumber: "desc" },
      select:  { tickNumber: true },
    }),
  ]);

  if (!player) return NextResponse.json({ error: "Player not found" }, { status: 404 });

  const currentTick = lastTick?.tickNumber ?? BigInt(0);

  // Enterprises summary
  const enterprises = await prisma.enterprise.findMany({
    where:   { playerId },
    select: {
      id: true, name: true, type: true,
      isOperational: true, isSeized: true, isFrozenByInspection: true, isLegallyFrozen: true,
      landPlot: { select: { city: { select: { name: true } } } },
      employees: { select: { id: true } },
    },
    orderBy: { id: "asc" },
    take: 12,
  });

  // Financial logs for chart (grouped by day via recordedAt)
  const logs = await prisma.financialLog.findMany({
    where:   { playerId },
    orderBy: { recordedAt: "desc" },
    take: 200,
    select:  { category: true, amountUah: true, recordedAt: true },
  });

  type ChartEntry = { date: string; revenue: number; expenses: number };
  const dayMap = new Map<string, ChartEntry>();
  for (const log of logs) {
    const day = log.recordedAt.toISOString().slice(0, 10);
    if (!dayMap.has(day)) dayMap.set(day, { date: day, revenue: 0, expenses: 0 });
    const entry = dayMap.get(day)!;
    const amt = Number(log.amountUah);
    if (log.category.startsWith("REVENUE")) entry.revenue += Math.abs(amt);
    else if (log.category.startsWith("EXPENSE")) entry.expenses += Math.abs(amt);
  }
  const chartData = Array.from(dayMap.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-10)
    .map((d) => ({ ...d, profit: d.revenue - d.expenses }));

  // Recent transactions (last 12)
  const recentTxns = await prisma.financialTransaction.findMany({
    where:   { playerId },
    orderBy: { createdAt: "desc" },
    take: 12,
    select:  { type: true, amountUah: true, description: true, createdAt: true },
  });

  // Worn/broken equipment (Equipment → Workshop → Enterprise)
  const brokenEquipment = await prisma.equipment.findMany({
    where: {
      workshop: { enterprise: { playerId } },
      status:   { in: ["WORN", "BROKEN"] },
    },
    select: {
      id: true, status: true, wearAndTear: true,
      workshop: { select: { enterprise: { select: { id: true, name: true } } } },
    },
    take: 20,
  });

  const warnings = brokenEquipment.map((eq) => ({
    type:           eq.status === "BROKEN" ? "EQUIPMENT_BROKEN" : "EQUIPMENT_WORN",
    severity:       eq.status === "BROKEN" ? "error" : "warning",
    enterpriseId:   eq.workshop.enterprise.id,
    enterpriseName: eq.workshop.enterprise.name,
    detail:         `Знос ${(Number(eq.wearAndTear) * 100).toFixed(0)}%`,
  }));

  return NextResponse.json({
    player: {
      companyName:         player.companyName,
      cashBalance:         Number(player.cashBalance),
      balanceUsd:          Number(player.balanceUsd),
      netWorth:            Number(player.netWorth),
      creditRating:        player.creditRating,
      reputationScore:     player.reputationScore,
      companyValuationUah: Number(player.companyValuationUah),
      isOperationsFrozen:  player.isOperationsFrozen,
      isBankrupt:          player.isBankrupt,
    },
    enterprises: enterprises.map((e) => ({
      id:        e.id,
      name:      e.name,
      type:      e.type,
      city:      e.landPlot.city.name,
      isActive:  e.isOperational && !e.isSeized,
      isFrozen:  e.isFrozenByInspection || e.isLegallyFrozen,
      employees: e.employees.length,
    })),
    chartData,
    currentTick: Number(currentTick),
    warnings,
    recentTxns: recentTxns.map((t) => ({
      type:        t.type,
      amount:      Number(t.amountUah),
      description: t.description,
      date:        t.createdAt,
    })),
  });
}
