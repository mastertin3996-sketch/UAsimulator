import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getEnterpriseRoles,
  getRoleWorkerCounts,
  computeMood,
  getMoodStatus,
  MOOD_STATUS_LABELS,
} from "@/lib/hr-config";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const enterprises = await prisma.enterprise.findMany({
    where: { company: { ownerId: session.user.id }, isActive: true },
    select: {
      id              : true,
      name            : true,
      enterpriseTypeId: true,
      salaryOffered   : true,
      workersCurrent  : true,
      workersMax      : true,
      satisfaction    : true,
      strikeEndsAt    : true,
      city            : { select: { name: true } },
      enterpriseType  : { select: { name: true, category: true } },
      roleSalaries    : { select: { roleId: true, salaryOffered: true } },
    },
    orderBy: { name: "asc" },
  });

  const currentTick = await prisma.gameTick.findFirst({
    orderBy: { tickNumber: "desc" },
    select: { tickNumber: true },
  });
  const tickNumber = currentTick?.tickNumber ?? 0;

  let summaryWorkers = 0, summaryMaxWorkers = 0, summaryStrikes = 0;
  let summaryMoodSum = 0, summarySalaryPerTick = 0;

  const result = enterprises.map((e) => {
    const cityName       = e.city.name;
    const typeId         = e.enterpriseTypeId;
    const globalFallback = Number(e.salaryOffered);
    const rsMap          = new Map(e.roleSalaries.map((rs) => [rs.roleId, Number(rs.salaryOffered)]));

    const roles        = getEnterpriseRoles(typeId, cityName);
    const workerCounts = getRoleWorkerCounts(typeId, e.workersCurrent);

    let weightedMood = 0, totalWeight = 0, totalSalaryPerTick = 0;

    const rolesData = roles.map((role) => {
      const playerSalary = rsMap.get(role.id) ?? globalFallback;
      const roleMood     = computeMood(playerSalary, role.marketSalaryLocal);
      const count        = workerCounts[role.id] ?? 0;
      weightedMood  += roleMood * role.productivityWeight;
      totalWeight   += role.productivityWeight;
      totalSalaryPerTick += playerSalary * count;
      return {
        id               : role.id,
        name             : role.name,
        productivityWeight: role.productivityWeight,
        marketSalaryLocal: role.marketSalaryLocal,
        salaryOffered    : playerSalary,
        workerCount      : count,
        mood             : Math.round(roleMood * 100),
        moodStatus       : getMoodStatus(roleMood, false),
        moodLabel        : MOOD_STATUS_LABELS[getMoodStatus(roleMood, false)],
        salaryRatio      : role.marketSalaryLocal > 0
          ? Math.round((playerSalary / role.marketSalaryLocal) * 100)
          : 100,
      };
    });

    const overallMood = totalWeight > 0 ? weightedMood / totalWeight : 0.8;
    const isOnStrike  = (e.strikeEndsAt ?? 0) > tickNumber;
    const status      = getMoodStatus(overallMood, isOnStrike);

    summaryWorkers     += e.workersCurrent;
    summaryMaxWorkers  += e.workersMax;
    if (isOnStrike) summaryStrikes++;
    summaryMoodSum     += overallMood;
    summarySalaryPerTick += totalSalaryPerTick;

    return {
      id            : e.id,
      name          : e.name,
      cityName,
      typeName      : e.enterpriseType.name,
      category      : e.enterpriseType.category,
      workersCurrent: e.workersCurrent,
      workersMax    : e.workersMax,
      fillRate      : e.workersMax > 0 ? Math.round((e.workersCurrent / e.workersMax) * 100) : 0,
      mood          : Math.round(overallMood * 100),
      moodStatus    : status,
      moodLabel     : MOOD_STATUS_LABELS[status],
      isOnStrike,
      strikeEndsAt  : e.strikeEndsAt,
      totalSalaryPerTick,
      roles         : rolesData,
    };
  });

  const n = enterprises.length;

  return NextResponse.json({
    enterprises: result,
    summary: {
      totalWorkers      : summaryWorkers,
      maxWorkers        : summaryMaxWorkers,
      fillRate          : summaryMaxWorkers > 0 ? Math.round((summaryWorkers / summaryMaxWorkers) * 100) : 0,
      totalSalaryPerTick: Math.round(summarySalaryPerTick),
      avgMood           : n > 0 ? Math.round((summaryMoodSum / n) * 100) : 0,
      enterprisesOnStrike: summaryStrikes,
    },
  });
}
