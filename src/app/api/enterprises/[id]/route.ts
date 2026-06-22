import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: enterpriseId } = await params;
  const playerId = session.user.id;

  const enterprise = await prisma.enterprise.findFirst({
    where: { id: enterpriseId, playerId },
    select: {
      id: true, name: true, type: true,
      footprintM2: true, totalFloorAreaM2: true, usedFloorAreaM2: true,
      isOperational: true, isSeized: true, isFrozenByInspection: true,
      isLegallyFrozen: true, isCollateral: true,
      inspectionFreezeUntilTick: true, legalFreezeUntilTick: true, legalFreezeReason: true,
      basePowerKwhPerTick: true,
      energySourceType: true, solarCapacityKw: true, batteryCapacityKwh: true, currentBatteryKwh: true,
      constructedAt: true,
      landPlot: {
        select: {
          id: true, cadastralNumber: true, totalAreaM2: true, usedAreaM2: true,
          status: true, monthlyLeaseCostUah: true, purchasePriceUah: true,
          city: { select: { id: true, name: true, nameUa: true, region: true, energyTariffUah: true } },
        },
      },
      employees: {
        orderBy: { profession: "asc" },
        select: {
          id: true, firstName: true, lastName: true, profession: true,
          salaryUah: true, mood: true, efficiency: true, baseEfficiency: true,
          isOnStrike: true, strikeStartedTick: true, hiredAt: true,
          accruedSalaryUah: true, lastPaidAt: true,
        },
      },
      workshops: {
        orderBy: { name: "asc" },
        select: {
          id: true, name: true, footprintM2: true, maxCapacity: true,
          currentVolume: true, isActive: true, basePowerKwhPerTick: true,
          equipment: {
            select: {
              id: true, name: true, status: true, wearAndTear: true,
              energyConsumptionKw: true, marketValueUah: true, maintenanceCostUah: true,
              purchasedAt: true, isBroken: true,
            },
          },
          productionOrders: {
            where: { status: "IN_PROGRESS" },
            select: {
              id: true, targetQuantity: true, completedQuantity: true,
              outputQuality: true, ticksRemaining: true,
              recipe: { select: { id: true, name: true, enterpriseType: true } },
            },
          },
        },
      },
      inventory: {
        where: { quantity: { gt: 0 } },
        orderBy: { quantity: "desc" },
        take: 50,
        select: {
          quantity: true, avgQuality: true,
          product: { select: { id: true, sku: true, nameUa: true, unit: true } },
        },
      },
      licenses: {
        select: { id: true, type: true, status: true, issuedAt: true, expiresAtTick: true },
      },
    },
  });

  if (!enterprise) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Recent financial logs for this enterprise
  const logs = await prisma.financialLog.findMany({
    where: { playerId, referenceId: enterpriseId },
    orderBy: { recordedAt: "desc" },
    take: 30,
    select: { id: true, category: true, amountUah: true, description: true, recordedAt: true, tickNumber: true },
  });

  // Recent production logs for this enterprise
  const productionLogs = await prisma.productionLog.findMany({
    where: { playerId, enterpriseId },
    orderBy: { tickNumber: "desc" },
    take: 20,
    select: { id: true, workshopId: true, recipeId: true, tickNumber: true, unitsProduced: true, avgQuality: true, recordedAt: true },
  });

  const TICKS_PER_MONTH = 30;
  const salaryPerTick = enterprise.employees.reduce((s, emp) => s + Number(emp.salaryUah) * 1.22, 0) / TICKS_PER_MONTH;
  const rentPerTick = Number(enterprise.landPlot.monthlyLeaseCostUah) / TICKS_PER_MONTH;
  const avgEfficiency = enterprise.employees.length > 0
    ? enterprise.employees.reduce((s, e) => s + e.efficiency, 0) / enterprise.employees.length
    : 1.0;
  const avgMood = enterprise.employees.length > 0
    ? enterprise.employees.reduce((s, e) => s + e.mood, 0) / enterprise.employees.length
    : 1.0;

  return NextResponse.json({
    enterprise: {
      ...enterprise,
      inspectionFreezeUntilTick: enterprise.inspectionFreezeUntilTick?.toString() ?? null,
      legalFreezeUntilTick: enterprise.legalFreezeUntilTick?.toString() ?? null,
      solarCapacityKw: Number(enterprise.solarCapacityKw),
      batteryCapacityKwh: Number(enterprise.batteryCapacityKwh),
      currentBatteryKwh: Number(enterprise.currentBatteryKwh),
      landPlot: {
        ...enterprise.landPlot,
        monthlyLeaseCostUah: Number(enterprise.landPlot.monthlyLeaseCostUah),
        purchasePriceUah: Number(enterprise.landPlot.purchasePriceUah),
        energyTariffUah: Number(enterprise.landPlot.city.energyTariffUah),
      },
      employees: enterprise.employees.map((e) => ({
        ...e,
        salaryUah: Number(e.salaryUah),
        accruedSalaryUah: Number(e.accruedSalaryUah),
        strikeStartedTick: e.strikeStartedTick?.toString() ?? null,
      })),
      workshops: enterprise.workshops.map((w) => ({
        ...w,
        equipment: w.equipment.map((eq) => ({
          ...eq,
          marketValueUah: Number(eq.marketValueUah),
          maintenanceCostUah: Number(eq.maintenanceCostUah),
        })),
      })),
      inventory: enterprise.inventory.map((i) => ({
        ...i,
        quantity: Number(i.quantity),
        quality: i.avgQuality,
      })),
    },
    stats: { salaryPerTick, rentPerTick, avgEfficiency, avgMood },
    logs: logs.map((l) => ({ ...l, amountUah: Number(l.amountUah), tickNumber: l.tickNumber.toString() })),
    productionLogs: productionLogs.map((l) => ({ ...l, tickNumber: l.tickNumber.toString() })),
  });
}
