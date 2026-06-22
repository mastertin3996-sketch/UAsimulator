import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EnterpriseType } from "@prisma/client";

const CATEGORY_MAP: Record<EnterpriseType, "EXTRACTION" | "PRODUCTION" | "TRADE" | "LOGISTICS"> = {
  OFFICE: "PRODUCTION",
  AGRO_FARM: "EXTRACTION",
  TEXTILE_FACTORY: "PRODUCTION",
  FOOD_PROCESSING: "PRODUCTION",
  RETAIL_STORE: "TRADE",
  WAREHOUSE: "LOGISTICS",
  LOGISTICS_HUB: "LOGISTICS",
  RD_LABORATORY: "PRODUCTION",
};

const TYPE_NAME: Record<EnterpriseType, string> = {
  OFFICE: "Офіс",
  AGRO_FARM: "Агроферма",
  TEXTILE_FACTORY: "Текстильна фабрика",
  FOOD_PROCESSING: "Харчова переробка",
  RETAIL_STORE: "Роздрібна торгівля",
  WAREHOUSE: "Склад",
  LOGISTICS_HUB: "Логістичний хаб",
  RD_LABORATORY: "НДЛабораторія",
};

const TYPE_ICON: Record<EnterpriseType, string> = {
  OFFICE: "🏢",
  AGRO_FARM: "🌾",
  TEXTILE_FACTORY: "🧵",
  FOOD_PROCESSING: "🏭",
  RETAIL_STORE: "🏪",
  WAREHOUSE: "📦",
  LOGISTICS_HUB: "🚛",
  RD_LABORATORY: "🔬",
};

const TICKS_PER_MONTH = 30;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;

  const lastTick = await prisma.gameTick.findFirst({
    orderBy: { tickNumber: "desc" },
    select: { tickNumber: true },
  });
  const currentTick = Number(lastTick?.tickNumber ?? 0);

  const enterprises = await prisma.enterprise.findMany({
    where: { playerId },
    select: {
      id: true, name: true, type: true,
      footprintM2: true, isOperational: true, isSeized: true,
      isFrozenByInspection: true, isLegallyFrozen: true,
      landPlot: {
        select: {
          monthlyLeaseCostUah: true,
          city: { select: { nameUa: true } },
        },
      },
      employees: {
        select: {
          salaryUah: true, efficiency: true,
          isOnStrike: true, strikeStartedTick: true,
        },
      },
      workshops: {
        select: {
          id: true,
          equipment: { select: { status: true } },
          productionOrders: {
            where: { status: "IN_PROGRESS" },
            select: { id: true },
          },
        },
      },
    },
    orderBy: { id: "asc" },
  });

  // Average quality from recent production logs
  const recentLogs = await prisma.productionLog.groupBy({
    by: ["enterpriseId"],
    where: { playerId, enterpriseId: { in: enterprises.map((e) => e.id) } },
    _avg: { avgQuality: true },
  });
  const qualityMap = new Map(recentLogs.map((l) => [l.enterpriseId, l._avg.avgQuality ?? 7.0]));

  const result = enterprises.map((e) => {
    const allEquip    = e.workshops.flatMap((w) => w.equipment);
    const wornEquip   = allEquip.filter((eq) => eq.status === "WORN").length;
    const brokenEquip = allEquip.filter((eq) => eq.status === "BROKEN").length;

    const totalLines   = e.workshops.length;
    const linesNoRecipe = e.workshops.filter((w) => w.productionOrders.length === 0).length;

    const workersCurrent = e.employees.length;
    const workersMax     = Math.max(workersCurrent, totalLines * 5);

    const avgEfficiency = e.employees.length > 0
      ? e.employees.reduce((s, emp) => s + emp.efficiency, 0) / e.employees.length
      : 1.0;

    const hasStrike  = e.employees.some((emp) => emp.isOnStrike);
    const strikeEndsAt = hasStrike ? currentTick + 10 : null;

    const rentPerTick   = Number(e.landPlot.monthlyLeaseCostUah) / TICKS_PER_MONTH;
    const salaryPerTick = e.employees.reduce((s, emp) => s + Number(emp.salaryUah) * 1.22, 0) / TICKS_PER_MONTH;

    const isActive = e.isOperational && !e.isSeized && !e.isFrozenByInspection && !e.isLegallyFrozen;

    return {
      id: e.id, name: e.name,
      category: CATEGORY_MAP[e.type],
      typeName: TYPE_NAME[e.type],
      typeIcon: TYPE_ICON[e.type],
      cityName: e.landPlot.city.nameUa,
      level: 1,
      size: Math.round(e.footprintM2),
      workersCurrent, workersMax,
      quality: qualityMap.get(e.id) ?? 7.0,
      efficiency: avgEfficiency,
      isActive, strikeEndsAt,
      rentPerTick, salaryPerTick, lastTickNet: null,
      wornEquip, brokenEquip, totalLines, linesNoRecipe,
    };
  });

  return NextResponse.json({ enterprises: result, currentTick });
}
