import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Training cost & duration per level (1-5)
const TRAINING_CONFIG: Record<number, { costUah: number; ticks: number; efficiencyBonus: number }> = {
  1: { costUah:  15_000, ticks:  3, efficiencyBonus: 0.05 },
  2: { costUah:  35_000, ticks:  7, efficiencyBonus: 0.10 },
  3: { costUah:  70_000, ticks: 14, efficiencyBonus: 0.15 },
  4: { costUah: 140_000, ticks: 21, efficiencyBonus: 0.20 },
  5: { costUah: 250_000, ticks: 30, efficiencyBonus: 0.25 },
};

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const playerId = session.user.id;

  const [employees, trainings, player] = await Promise.all([
    prisma.employee.findMany({
      where:   { playerId, isOnStrike: false },
      select: {
        id: true, firstName: true, lastName: true, profession: true,
        qualificationLevel: true, baseEfficiency: true, efficiency: true,
        salaryUah: true, mood: true,
        enterprise: { select: { name: true } },
        trainingSessions: {
          where:   { isCompleted: false },
          orderBy: { startedAt: "desc" },
          take: 1,
          select: { id: true, targetLevel: true, ticksRemaining: true, ticksRequired: true },
        },
      },
      orderBy: [{ enterprise: { name: "asc" } }, { qualificationLevel: "desc" }],
    }),
    prisma.trainingSession.findMany({
      where:   { playerId, isCompleted: false },
      select:  { id: true, employeeId: true, targetLevel: true, ticksRemaining: true, ticksRequired: true, costUah: true },
    }),
    prisma.player.findUnique({ where: { id: playerId }, select: { cashBalance: true } }),
  ]);

  return NextResponse.json({
    employees: employees.map((e) => ({
      id:                 e.id,
      name:               `${e.firstName} ${e.lastName}`,
      profession:         e.profession,
      enterpriseName:     e.enterprise.name,
      qualificationLevel: e.qualificationLevel,
      baseEfficiency:     e.baseEfficiency,
      efficiency:         e.efficiency,
      salaryUah:          Number(e.salaryUah),
      mood:               e.mood,
      activeTraining:     e.trainingSessions[0] ?? null,
    })),
    activeTrainings: trainings.map((t) => ({
      id:            t.id,
      employeeId:    t.employeeId,
      targetLevel:   t.targetLevel,
      ticksRemaining: t.ticksRemaining,
      ticksRequired:  t.ticksRequired,
      costUah:        Number(t.costUah),
    })),
    cashBalance: Number(player?.cashBalance ?? 0),
    config: TRAINING_CONFIG,
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const playerId = session.user.id;

  const body = await req.json().catch(() => ({})) as { employeeId?: string };
  if (!body.employeeId) return NextResponse.json({ error: "Потрібен employeeId" }, { status: 400 });

  const employee = await prisma.employee.findFirst({
    where: { id: body.employeeId, playerId },
    select: { id: true, qualificationLevel: true, trainingSessions: { where: { isCompleted: false }, select: { id: true } } },
  });
  if (!employee) return NextResponse.json({ error: "Працівника не знайдено" }, { status: 404 });
  if (employee.trainingSessions.length > 0) return NextResponse.json({ error: "Вже проходить навчання" }, { status: 400 });

  const nextLevel = employee.qualificationLevel + 1;
  if (nextLevel > 5) return NextResponse.json({ error: "Максимальний рівень кваліфікації досягнуто" }, { status: 400 });

  const cfg = TRAINING_CONFIG[nextLevel];
  const player = await prisma.player.findUnique({ where: { id: playerId }, select: { cashBalance: true } });
  if (!player || Number(player.cashBalance) < cfg.costUah) {
    return NextResponse.json({ error: `Недостатньо коштів: потрібно ₴${cfg.costUah.toLocaleString()}` }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.player.update({ where: { id: playerId }, data: { cashBalance: { decrement: cfg.costUah } } }),
    prisma.trainingSession.create({
      data: {
        employeeId:    body.employeeId,
        playerId,
        targetLevel:   nextLevel,
        costUah:       cfg.costUah,
        ticksRequired: cfg.ticks,
        ticksRemaining: cfg.ticks,
      },
    }),
  ]);

  return NextResponse.json({ ok: true, targetLevel: nextLevel, ticks: cfg.ticks }, { status: 201 });
}
