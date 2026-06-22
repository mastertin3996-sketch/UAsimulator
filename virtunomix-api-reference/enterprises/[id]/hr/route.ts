/**
 * GET  /api/enterprises/:id/hr  — HR-дашборд з per-role зарплатами та настроями
 * PATCH /api/enterprises/:id/hr — оновлення зарплати для конкретної ролі
 *   Body: { roleId: string; salary: number }
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getEnterpriseRoles,
  getWeightedMarketSalary,
  getRoleWorkerCounts,
  computeMood,
  getMoodStatus,
  MOOD_STATUS_LABELS,
} from "@/lib/hr-config";

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const enterprise = await prisma.enterprise.findUnique({
    where  : { id },
    select : {
      id              : true,
      name            : true,
      enterpriseTypeId: true,
      salaryOffered   : true,
      workersCurrent  : true,
      workersMax      : true,
      satisfaction    : true,
      strikeEndsAt    : true,
      city            : { select: { name: true } },
      company         : { select: { ownerId: true } },
      enterpriseType  : { select: { name: true, category: true } },
      roleSalaries    : { select: { roleId: true, salaryOffered: true } },
    },
  });

  if (!enterprise) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (enterprise.company.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const cityName       = enterprise.city.name;
  const typeId         = enterprise.enterpriseTypeId;
  const globalFallback = Number(enterprise.salaryOffered);
  const roleSalaryMap  = new Map(enterprise.roleSalaries.map((rs) => [rs.roleId, Number(rs.salaryOffered)]));

  const roles        = getEnterpriseRoles(typeId, cityName);
  const workerCounts = getRoleWorkerCounts(typeId, enterprise.workersCurrent);

  // Per-role дані
  let weightedMood  = 0;
  let totalWeight   = 0;

  const rolesData = roles.map((role) => {
    const playerSalary  = roleSalaryMap.get(role.id) ?? globalFallback;
    const roleMood      = computeMood(playerSalary, role.marketSalaryLocal);
    const roleMoodStatus = getMoodStatus(roleMood, false);
    weightedMood += roleMood * role.productivityWeight;
    totalWeight  += role.productivityWeight;
    return {
      id                : role.id,
      name              : role.name,
      productivityWeight: role.productivityWeight,
      kyivUah           : role.kyivUah,
      marketSalaryKyiv  : role.marketSalaryKyiv,
      marketSalaryLocal : role.marketSalaryLocal,
      salaryOffered     : playerSalary,
      workerCount       : workerCounts[role.id] ?? 0,
      mood              : Math.round(roleMood * 100),
      moodStatus        : roleMoodStatus,
      moodLabel         : MOOD_STATUS_LABELS[roleMoodStatus],
      salaryRatio       : role.marketSalaryLocal > 0
        ? Math.round((playerSalary / role.marketSalaryLocal) * 100)
        : 100,
    };
  });

  const overallMood   = totalWeight > 0 ? weightedMood / totalWeight : 0.8;
  const marketSalary  = getWeightedMarketSalary(typeId, cityName);

  const currentTick = await prisma.gameTick.findFirst({
    orderBy: { tickNumber: "desc" },
    select : { tickNumber: true },
  });
  const tickNumber  = currentTick?.tickNumber ?? 0;
  const isOnStrike  = (enterprise.strikeEndsAt ?? 0) > tickNumber;
  const status      = getMoodStatus(overallMood, isOnStrike);

  // Загальна ЗП за тік (для довідки)
  let totalSalaryPerTick = 0;
  for (const role of rolesData) {
    totalSalaryPerTick += role.salaryOffered * role.workerCount;
  }

  return NextResponse.json({
    enterpriseId  : enterprise.id,
    enterpriseName: enterprise.name,
    cityName,
    enterpriseType: enterprise.enterpriseType.name,
    category      : enterprise.enterpriseType.category,

    mood          : Math.round(overallMood * 100),
    moodRaw       : overallMood,
    moodStatus    : status,
    moodLabel     : MOOD_STATUS_LABELS[status],

    marketSalary,
    totalSalaryPerTick,

    isOnStrike,
    strikeEndsAt  : enterprise.strikeEndsAt,

    workersCurrent: enterprise.workersCurrent,
    workersMax    : enterprise.workersMax,
    fillRate      : enterprise.workersMax > 0
      ? Math.round((enterprise.workersCurrent / enterprise.workersMax) * 100)
      : 0,

    capacityMultiplier: Math.round(overallMood * 100),

    roles: rolesData,

    formula: {
      atMarketRate  : "80% mood → 80% capacity",
      atPremium20pct: "100% mood → 100% capacity",
      belowMarket   : "mood = 80% × (salary/market)² → стрімке падіння",
      strikeThreshold: "mood < 30% → ризик страйку",
    },
  });
}

// ─── PATCH — оновити зарплату конкретної ролі ─────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id }                       = await params;
  const { roleId, salary }           = await req.json() as { roleId: string; salary: number };

  if (!roleId || !salary || salary <= 0) {
    return NextResponse.json({ error: "roleId і salary > 0 обов'язкові" }, { status: 400 });
  }

  const enterprise = await prisma.enterprise.findUnique({
    where : { id },
    select: {
      id: true, enterpriseTypeId: true,
      company: { select: { ownerId: true } },
      city   : { select: { name: true } },
    },
  });

  if (!enterprise) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (enterprise.company.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const cityName    = enterprise.city.name;
  const roles       = getEnterpriseRoles(enterprise.enterpriseTypeId, cityName);
  const role        = roles.find((r) => r.id === roleId);
  if (!role) return NextResponse.json({ error: "Роль не знайдена для цього підприємства" }, { status: 400 });

  // Upsert per-role salary
  await prisma.enterpriseRoleSalary.upsert({
    where : { enterpriseId_roleId: { enterpriseId: id, roleId } },
    update: { salaryOffered: salary },
    create: { enterpriseId: id, roleId, salaryOffered: salary },
  });

  // Перераховуємо загальний настрій для preview
  const allRoleSalaries = await prisma.enterpriseRoleSalary.findMany({
    where : { enterpriseId: id },
    select: { roleId: true, salaryOffered: true },
  });
  const globalFallback = await prisma.enterprise.findUnique({
    where: { id }, select: { salaryOffered: true },
  });
  const rsMap = new Map(allRoleSalaries.map((rs) => [rs.roleId, Number(rs.salaryOffered)]));

  let weightedMood = 0, totalWeight = 0;
  for (const r of roles) {
    const ps = rsMap.get(r.id) ?? Number(globalFallback?.salaryOffered ?? 1500);
    weightedMood += computeMood(ps, r.marketSalaryLocal) * r.productivityWeight;
    totalWeight  += r.productivityWeight;
  }
  const newOverallMood = totalWeight > 0 ? weightedMood / totalWeight : 0.8;
  const newRoleMood    = computeMood(salary, role.marketSalaryLocal);

  return NextResponse.json({
    ok             : true,
    roleId,
    newSalary      : salary,
    marketSalary   : role.marketSalaryLocal,
    newRoleMood    : Math.round(newRoleMood * 100),
    newOverallMood : Math.round(newOverallMood * 100),
    salaryRatio    : Math.round((salary / role.marketSalaryLocal) * 100),
  });
}
