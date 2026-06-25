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

  const [
    enterprises,
    logs,
    recentTxns,
    brokenEquipment,
    snapshots,
    lastTickLogs,
    allEmployees,
    compliance,
  ] = await Promise.all([
    // Enterprises summary
    prisma.enterprise.findMany({
      where:   { playerId },
      select: {
        id: true, name: true, type: true,
        isOperational: true, isSeized: true, isFrozenByInspection: true, isLegallyFrozen: true,
        landPlot: { select: { city: { select: { name: true } } } },
        employees:  { select: { id: true } },
        workshops:  { select: { isActive: true } },
      },
      orderBy: { id: "asc" },
      take: 12,
    }),

    // Financial logs for chart
    prisma.financialLog.findMany({
      where:   { playerId },
      orderBy: { recordedAt: "desc" },
      take: 200,
      select:  { category: true, amountUah: true, recordedAt: true },
    }),

    // Recent transactions (last 12)
    prisma.financialTransaction.findMany({
      where:   { playerId },
      orderBy: { createdAt: "desc" },
      take: 12,
      select:  { type: true, amountUah: true, description: true, createdAt: true },
    }),

    // Worn/broken equipment
    prisma.equipment.findMany({
      where: { workshop: { enterprise: { playerId } }, status: { in: ["WORN", "BROKEN"] } },
      select: {
        id: true, status: true, wearAndTear: true,
        workshop: { select: { enterprise: { select: { id: true, name: true } } } },
      },
      take: 20,
    }),

    // Daily snapshots for net worth chart (last 20)
    prisma.dailySnapshot.findMany({
      where:   { playerId },
      orderBy: { tickNumber: "desc" },
      take: 20,
      select: {
        tickNumber: true, cashBalance: true, totalAssetsValue: true,
        revenueUah: true, opexUah: true, netProfitUah: true,
        employeeCount: true, averageWorkerMood: true, activeEnterprises: true,
      },
    }),

    // Production this tick
    prisma.productionLog.findMany({
      where:   { playerId, tickNumber: currentTick },
      select:  { unitsProduced: true, avgQuality: true },
    }),

    // Employee stats
    prisma.employee.findMany({
      where:  { enterprise: { playerId } },
      select: { efficiency: true, mood: true },
    }),

    // Compliance record
    prisma.complianceRecord.findUnique({
      where:  { playerId },
      select: { score: true, lastAuditTick: true, consecutiveViolations: true },
    }),
  ]);

  // ── Chart data from financial logs ──────────────────────────────────────
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

  // ── Warnings ─────────────────────────────────────────────────────────────
  const warnings = brokenEquipment.map((eq) => ({
    type:           eq.status === "BROKEN" ? "EQUIPMENT_BROKEN" : "EQUIPMENT_WORN",
    severity:       eq.status === "BROKEN" ? "error" : "warning",
    enterpriseId:   eq.workshop.enterprise.id,
    enterpriseName: eq.workshop.enterprise.name,
    detail:         `Знос ${(Number(eq.wearAndTear) * 100).toFixed(0)}%`,
  }));

  // ── Snapshots for net worth chart (oldest first) ──────────────────────
  const snapshotChart = [...snapshots].reverse().map((s) => ({
    tick:         Number(s.tickNumber),
    cashBalance:  Number(s.cashBalance),
    totalAssets:  Number(s.totalAssetsValue),
    revenue:      Number(s.revenueUah),
    opex:         Number(s.opexUah),
    netProfit:    Number(s.netProfitUah),
    employees:    s.employeeCount,
    mood:         s.averageWorkerMood,
  }));

  // ── Last snapshot P&L ─────────────────────────────────────────────────
  const lastSnap = snapshots[0];
  const pnl = lastSnap ? {
    revenue:   Number(lastSnap.revenueUah),
    opex:      Number(lastSnap.opexUah),
    netProfit: Number(lastSnap.netProfitUah),
    employees: lastSnap.employeeCount,
    mood:      Number(lastSnap.averageWorkerMood.toFixed(2)),
  } : null;

  // ── Production this tick ──────────────────────────────────────────────
  const totalUnitsThisTick = lastTickLogs.reduce((s, l) => s + l.unitsProduced, 0);
  const avgQualityThisTick = lastTickLogs.length
    ? lastTickLogs.reduce((s, l) => s + l.avgQuality, 0) / lastTickLogs.length
    : 0;

  // ── Employee aggregate stats ──────────────────────────────────────────
  const employeeCount   = allEmployees.length;
  const avgEfficiency   = employeeCount
    ? allEmployees.reduce((s, e) => s + e.efficiency, 0) / employeeCount : 0;
  const avgMood         = employeeCount
    ? allEmployees.reduce((s, e) => s + e.mood, 0) / employeeCount : 0;

  // ── Next monthly tick ─────────────────────────────────────────────────
  const TICKS_PER_MONTH = 30;
  const tick = Number(currentTick);
  const nextMonthlyTick = tick === 0 ? TICKS_PER_MONTH : Math.ceil(tick / TICKS_PER_MONTH) * TICKS_PER_MONTH;
  const ticksUntilMonth = tick === 0 ? TICKS_PER_MONTH : nextMonthlyTick - tick;

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
      id:           e.id,
      name:         e.name,
      type:         e.type,
      city:         e.landPlot.city.name,
      isActive:     e.isOperational && !e.isSeized,
      isFrozen:     e.isFrozenByInspection || e.isLegallyFrozen,
      employees:    e.employees.length,
      workshops:    e.workshops.filter((w) => w.isActive).length,
    })),
    chartData,
    snapshotChart,
    currentTick:  tick,
    warnings,
    recentTxns: recentTxns.map((t) => ({
      type:        t.type,
      amount:      Number(t.amountUah),
      description: t.description,
      date:        t.createdAt,
    })),
    stats: {
      employeeCount,
      avgEfficiency:    Number(avgEfficiency.toFixed(3)),
      avgMood:          Number(avgMood.toFixed(3)),
      totalUnitsThisTick:  Number(totalUnitsThisTick.toFixed(1)),
      avgQualityThisTick:  Number(avgQualityThisTick.toFixed(3)),
      ticksUntilMonth,
    },
    pnl,
    compliance: compliance ? {
      score:                compliance.score,
      consecutiveViolations: compliance.consecutiveViolations,
      lastAuditTick:        compliance.lastAuditTick ? Number(compliance.lastAuditTick) : null,
      riskLevel:
        compliance.score < 0.40 ? "high" :
        compliance.score < 0.70 ? "medium" : "low",
    } : null,
  });
}
