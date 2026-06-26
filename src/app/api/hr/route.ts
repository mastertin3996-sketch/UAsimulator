import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Profession, EnterpriseType } from "@prisma/client";

const PROF_UA: Record<Profession, string> = {
  ACCOUNTANT: "Бухгалтер", MANAGER: "Менеджер", OPERATOR: "Оператор",
  ENGINEER: "Інженер", AGRONOMIST: "Агроном", LOADER: "Вантажник",
  DRIVER: "Водій", SECURITY_GUARD: "Охоронник", SECURITY_OFFICER: "Нач. охорони",
  CLEANER: "Прибиральник", SALES_REP: "Торговий представник",
  IT_SPECIALIST: "IT-спеціаліст", LAWYER: "Юрист", HR_SPECIALIST: "HR-спеціаліст",
  TECHNICIAN: "Технік", QUALITY_CONTROLLER: "Контролер якості",
  RESEARCHER: "Дослідник", DATA_SCIENTIST: "Data scientist",
  CASHIER: "Касир", SALES_ASSISTANT: "Продавець-консультант", MERCHANDISER: "Мерчандайзер",
};

const TYPE_NAME: Record<EnterpriseType, string> = {
  OFFICE: "Офіс", AGRO_FARM: "Агроферма", TEXTILE_FACTORY: "Текстильна фабрика",
  FOOD_PROCESSING: "Харчова переробка", RETAIL_STORE: "Роздрібна торгівля",
  WAREHOUSE: "Склад", LOGISTICS_HUB: "Логістичний хаб", RD_LABORATORY: "НДЛабораторія",
};

const TYPE_CAT: Record<EnterpriseType, string> = {
  OFFICE: "PRODUCTION", AGRO_FARM: "EXTRACTION", TEXTILE_FACTORY: "PRODUCTION",
  FOOD_PROCESSING: "PRODUCTION", RETAIL_STORE: "TRADE", WAREHOUSE: "LOGISTICS",
  LOGISTICS_HUB: "LOGISTICS", RD_LABORATORY: "PRODUCTION",
};

function moodStatus(mood: number, onStrike: boolean) {
  if (onStrike)   return "STRIKE";
  if (mood >= 0.9) return "OPTIMAL";
  if (mood >= 0.75) return "GOOD";
  if (mood >= 0.6)  return "NORMAL";
  if (mood >= 0.4)  return "WARNING";
  return "DANGER";
}

const MOOD_LABELS: Record<string, string> = {
  OPTIMAL: "Відмінно", GOOD: "Добре", NORMAL: "Нормально",
  WARNING: "Попередження", DANGER: "Небезпека", STRIKE: "Страйк",
};

const TICKS_PER_MONTH = 30;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;

  const enterprises = await prisma.enterprise.findMany({
    where: { playerId },
    select: {
      id: true, name: true, type: true,
      landPlot: { select: { city: { select: { nameUa: true, wageBaselineUah: true } } } },
      employees: {
        select: {
          id: true, profession: true, salaryUah: true,
          mood: true, efficiency: true, isOnStrike: true, strikeStartedTick: true,
        },
      },
      workshops: { select: { _count: { select: { equipment: true } } } },
    },
    orderBy: { id: "asc" },
  });

  const lastTick = await prisma.gameTick.findFirst({
    orderBy: { tickNumber: "desc" },
    select: { tickNumber: true },
  });
  const currentTick = Number(lastTick?.tickNumber ?? 0);

  const entList = enterprises.map((ent) => {
    const cityWage = Number(ent.landPlot.city.wageBaselineUah);

    // Group employees by profession
    const byProf = new Map<Profession, typeof ent.employees>();
    for (const emp of ent.employees) {
      if (!byProf.has(emp.profession)) byProf.set(emp.profession, []);
      byProf.get(emp.profession)!.push(emp);
    }

    const roles = Array.from(byProf.entries()).map(([prof, emps]) => {
      const avgMood    = emps.reduce((s, e) => s + e.mood, 0) / emps.length;
      const avgSalary  = emps.reduce((s, e) => s + Number(e.salaryUah), 0) / emps.length;
      const onStrike   = emps.some((e) => e.isOnStrike);
      const ms         = moodStatus(avgMood, onStrike);
      return {
        id:               prof,
        name:             PROF_UA[prof] ?? prof,
        productivityWeight: 1.0,
        marketSalaryLocal: Math.round(cityWage * 1.2),
        salaryOffered:    Math.round(avgSalary),
        workerCount:      emps.length,
        mood:             Math.round(avgMood * 100),
        moodStatus:       ms,
        moodLabel:        MOOD_LABELS[ms],
        salaryRatio:      cityWage > 0 ? avgSalary / (cityWage * 1.2) : 1,
      };
    });

    const allOnStrike   = ent.employees.some((e) => e.isOnStrike);
    const strikeStart   = ent.employees.find((e) => e.isOnStrike)?.strikeStartedTick;
    const strikeEndsAt  = strikeStart ? Number(strikeStart) + 10 : null;
    const avgMood       = ent.employees.length > 0
      ? ent.employees.reduce((s, e) => s + e.mood, 0) / ent.employees.length : 1.0;
    const ms            = moodStatus(avgMood, allOnStrike);
    const totalSalary   = ent.employees.reduce((s, e) => s + Number(e.salaryUah) * 1.22, 0) / TICKS_PER_MONTH;
    const workersCurrent = ent.employees.length;
    const workersMax    = Math.max(workersCurrent, roles.length * 5);

    // Обладнання офісу
    const equipmentCount = ent.workshops.reduce((s, w) => s + w._count.equipment, 0);
    const equipRatio     = workersCurrent > 0 ? equipmentCount / workersCurrent : 0;
    const equipMoodDelta = ent.type === "OFFICE"
      ? (equipRatio >= 1.0 ? +0.015 : equipRatio < 0.5 ? -0.020 : 0)
      : null;

    return {
      id: ent.id, name: ent.name,
      cityName: ent.landPlot.city.nameUa,
      typeName: TYPE_NAME[ent.type],
      category: TYPE_CAT[ent.type],
      workersCurrent,
      workersMax,
      fillRate:    workersMax > 0 ? Math.round((workersCurrent / workersMax) * 100) : 0,
      mood:        Math.round(avgMood * 100),
      moodStatus:  ms,
      moodLabel:   MOOD_LABELS[ms],
      isOnStrike:  allOnStrike,
      strikeEndsAt,
      totalSalaryPerTick: Math.round(totalSalary),
      roles,
      equipment: ent.type === "OFFICE" ? { count: equipmentCount, ratio: +equipRatio.toFixed(2), moodDelta: equipMoodDelta } : null,
    };
  });

  const summary = {
    totalWorkers:        entList.reduce((s, e) => s + e.workersCurrent, 0),
    maxWorkers:          entList.reduce((s, e) => s + e.workersMax, 0),
    fillRate:            entList.length > 0 ? Math.round(entList.reduce((s, e) => s + e.fillRate, 0) / entList.length) : 0,
    totalSalaryPerTick:  Math.round(entList.reduce((s, e) => s + e.totalSalaryPerTick, 0)),
    avgMood:             entList.length > 0 ? Math.round(entList.reduce((s, e) => s + e.mood, 0) / entList.length) : 100,
    enterprisesOnStrike: entList.filter((e) => e.isOnStrike).length,
  };

  return NextResponse.json({ enterprises: entList, summary });
}

// PATCH /api/hr — bulk salary raise/cut by % for all employees
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const playerId = session.user.id;

  const body = await req.json().catch(() => ({})) as { percentChange?: number };
  const pct  = Number(body.percentChange ?? 0);
  if (!pct || Math.abs(pct) > 200) {
    return NextResponse.json({ error: "percentChange має бути від -200 до 200 (крім 0)" }, { status: 400 });
  }

  const multiplier = 1 + pct / 100;
  const result = await prisma.$executeRaw`
    UPDATE "Employee"
    SET "salaryUah" = GREATEST(1000, ROUND("salaryUah" * ${multiplier}::numeric, 0))
    WHERE "playerId" = ${playerId}
  `;

  return NextResponse.json({ ok: true, updated: result });
}
