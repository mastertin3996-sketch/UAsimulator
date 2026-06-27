import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: enterpriseId } = await params;

  const enterprise = await prisma.enterprise.findFirst({
    where: { id: enterpriseId, playerId: session.user.id },
    select: { id: true },
  });
  if (!enterprise) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const employees = await prisma.employee.findMany({
    where:   { enterpriseId },
    select: {
      id: true, firstName: true, lastName: true, profession: true,
      salaryUah: true, mood: true, efficiency: true, qualificationLevel: true,
      isOnStrike: true, baseEfficiency: true,
      trainingSessions: {
        where:   { isCompleted: false },
        select:  { id: true, targetLevel: true, ticksRemaining: true, ticksRequired: true },
        orderBy: { startedAt: "desc" },
        take:    1,
      },
    },
    orderBy: { hiredAt: "asc" },
  });

  return NextResponse.json({
    employees: employees.map(e => ({
      id:                e.id,
      name:              `${e.firstName} ${e.lastName}`,
      profession:        e.profession,
      salary:            Number(e.salaryUah),
      mood:              +e.mood.toFixed(2),
      efficiency:        +e.efficiency.toFixed(2),
      baseEfficiency:    +e.baseEfficiency.toFixed(2),
      qualificationLevel: e.qualificationLevel,
      isOnStrike:        e.isOnStrike,
      activeTraining:    e.trainingSessions[0] ?? null,
    })),
  });
}
