import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Profession } from "@prisma/client";

type Params = { params: Promise<{ id: string }> };

const MALE_FIRST   = ["Олексій","Михайло","Василь","Петро","Андрій","Іван","Сергій","Дмитро","Олег","Юрій","Максим","Богдан","Тарас","Віктор","Роман"];
const FEMALE_FIRST = ["Олена","Тетяна","Ірина","Наталія","Юлія","Оксана","Людмила","Ганна","Марія","Анна","Вікторія","Крістіна","Катерина","Лариса"];
const LAST_NAMES   = ["Коваль","Шевченко","Мельник","Бондаренко","Ткаченко","Кравченко","Лисенко","Поліщук","Сидоренко","Марченко","Ковальчук","Гриценко","Захаренко","Пономаренко","Іваненко"];

const SUGGESTED_SALARY: Record<string, number> = {
  ACCOUNTANT: 25_000, MANAGER: 35_000, OPERATOR: 18_000, ENGINEER: 40_000,
  AGRONOMIST: 22_000, LOADER: 15_000, DRIVER: 20_000, SECURITY_GUARD: 15_000,
  SECURITY_OFFICER: 30_000, CLEANER: 12_000, SALES_REP: 20_000,
  IT_SPECIALIST: 50_000, LAWYER: 45_000, HR_SPECIALIST: 28_000,
  TECHNICIAN: 22_000, QUALITY_CONTROLLER: 25_000, RESEARCHER: 35_000, DATA_SCIENTIST: 60_000,
};

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;
  const { id: enterpriseId } = await params;

  const enterprise = await prisma.enterprise.findFirst({
    where: { id: enterpriseId, playerId },
    include: { landPlot: { include: { city: true } } },
  });
  if (!enterprise) return NextResponse.json({ error: "Підприємство не знайдено" }, { status: 404 });

  const body = await req.json().catch(() => ({})) as {
    profession?: string;
    salaryUah?: number;
    firstName?: string;
    lastName?: string;
  };

  const { profession, salaryUah, firstName, lastName } = body;
  if (!profession) return NextResponse.json({ error: "Вкажіть profession" }, { status: 400 });

  const validProfessions = Object.values(Profession) as string[];
  if (!validProfessions.includes(profession)) {
    return NextResponse.json({ error: "Невідома посада" }, { status: 400 });
  }

  const isMale    = Math.random() > 0.5;
  const fName     = firstName?.trim() || randomItem(isMale ? MALE_FIRST : FEMALE_FIRST);
  const lName     = lastName?.trim()  || randomItem(LAST_NAMES);
  const salary    = salaryUah ?? SUGGESTED_SALARY[profession] ?? 20_000;
  const baseline  = Number(enterprise.landPlot.city.wageBaselineUah);
  const initMood  = salary >= baseline ? 0.80 : 0.65;

  const employee = await prisma.employee.create({
    data: {
      playerId, enterpriseId,
      firstName: fName, lastName: lName,
      profession: profession as Profession,
      salaryUah: salary,
      mood: initMood,
      baseEfficiency: 1.0,
      efficiency: initMood >= 0.7 ? 1.0 : initMood / 0.7,
    },
  });

  return NextResponse.json({
    ok: true,
    employee: {
      id: employee.id,
      firstName: employee.firstName, lastName: employee.lastName,
      profession: employee.profession, salaryUah: Number(employee.salaryUah),
    },
  }, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;
  const { id: enterpriseId } = await params;
  const body = await req.json().catch(() => ({})) as { employeeId?: string };

  if (!body.employeeId) return NextResponse.json({ error: "Потрібен employeeId" }, { status: 400 });

  const employee = await prisma.employee.findFirst({
    where: { id: body.employeeId, enterpriseId, playerId },
  });
  if (!employee) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  await prisma.employee.delete({ where: { id: body.employeeId } });
  return NextResponse.json({ ok: true });
}
