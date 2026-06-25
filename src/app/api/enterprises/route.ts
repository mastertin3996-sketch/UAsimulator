import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EnterpriseType } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

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
      isCollateral: true, isFrozenByInspection: true, isLegallyFrozen: true,
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
      isCollateral: e.isCollateral,
    };
  });

  return NextResponse.json({ enterprises: result, currentTick });
}

// ─── Enterprise creation costs (UAH) ─────────────────────────────────────────
const ENTERPRISE_COST: Record<string, number> = {
  OFFICE: 50_000,
  AGRO_FARM: 200_000,
  TEXTILE_FACTORY: 300_000,
  FOOD_PROCESSING: 250_000,
  RETAIL_STORE: 100_000,
  WAREHOUSE: 150_000,
  LOGISTICS_HUB: 200_000,
  RD_LABORATORY: 400_000,
};

const DEFAULT_FOOTPRINT: Record<string, number> = {
  OFFICE: 100,
  AGRO_FARM: 5_000,
  TEXTILE_FACTORY: 2_000,
  FOOD_PROCESSING: 1_500,
  RETAIL_STORE: 200,
  WAREHOUSE: 3_000,
  LOGISTICS_HUB: 4_000,
  RD_LABORATORY: 500,
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;
  const body = await req.json().catch(() => ({})) as {
    landPlotId?: string;
    type?: string;
    name?: string;
    footprintM2?: number;
    totalFloorAreaM2?: number;
  };

  const { landPlotId, type, name } = body;
  if (!landPlotId || !type || !name?.trim()) {
    return NextResponse.json({ error: "Потрібен landPlotId, type, name" }, { status: 400 });
  }

  const validTypes = Object.values(EnterpriseType) as string[];
  if (!validTypes.includes(type)) {
    return NextResponse.json({ error: "Невідомий тип підприємства" }, { status: 400 });
  }

  const plot = await prisma.landPlot.findUnique({
    where: { id: landPlotId },
    include: { city: true },
  });
  if (!plot) return NextResponse.json({ error: "Ділянка не знайдена" }, { status: 404 });
  if (plot.playerId !== playerId) return NextResponse.json({ error: "Не ваша ділянка" }, { status: 403 });

  const footprintM2   = body.footprintM2   ?? DEFAULT_FOOTPRINT[type] ?? 500;
  const totalFloorAreaM2 = body.totalFloorAreaM2 ?? footprintM2 * 1.5;

  const freeArea = plot.totalAreaM2 - plot.usedAreaM2;
  if (footprintM2 > freeArea) {
    return NextResponse.json({ error: `Недостатньо місця на ділянці. Вільно: ${freeArea} м²` }, { status: 400 });
  }

  const player = await prisma.player.findUniqueOrThrow({ where: { id: playerId } });
  const balance = new Decimal(player.cashBalance.toString());
  const cost    = new Decimal(ENTERPRISE_COST[type] ?? 100_000);

  if (balance.lessThan(cost)) {
    return NextResponse.json({ error: `Недостатньо коштів. Потрібно ${cost.toFixed(0)} ₴, є ${balance.toFixed(0)} ₴` }, { status: 400 });
  }

  const newBalance = balance.minus(cost);

  // If type is OFFICE, check no office exists yet for this player+city
  if (type === "OFFICE") {
    const existingOffice = await prisma.office.findUnique({
      where: { playerId_cityId: { playerId, cityId: plot.cityId } },
    });
    if (existingOffice) {
      return NextResponse.json({ error: "Офіс у цьому місті вже є" }, { status: 409 });
    }
  }

  const enterprise = await prisma.$transaction(async (tx) => {
    const ent = await tx.enterprise.create({
      data: {
        playerId, landPlotId,
        type: type as EnterpriseType,
        name: name.trim(),
        footprintM2, totalFloorAreaM2,
        isOperational: true,
        constructedAt: new Date(),
      },
    });

    // If OFFICE — create the Office record too
    if (type === "OFFICE") {
      await tx.office.create({
        data: {
          playerId, cityId: plot.cityId, enterpriseId: ent.id,
          sizeM2: footprintM2, isOperational: true, openedAt: new Date(),
        },
      });
    }

    // Update land used area
    await tx.landPlot.update({
      where: { id: landPlotId },
      data: { usedAreaM2: { increment: footprintM2 } },
    });

    // Deduct cost
    await tx.player.update({ where: { id: playerId }, data: { cashBalance: newBalance } });

    await tx.financialTransaction.create({
      data: {
        playerId, type: "CONSTRUCTION_COST",
        amountUah: cost.negated(),
        balanceBefore: balance,
        balanceAfter: newBalance,
        description: `Будівництво: ${name.trim()} (${TYPE_NAME[type as EnterpriseType] ?? type})`,
        referenceId: ent.id,
      },
    });

    return ent;
  });

  return NextResponse.json({ ok: true, enterprise: { id: enterprise.id, name: enterprise.name, type: enterprise.type } }, { status: 201 });
}
