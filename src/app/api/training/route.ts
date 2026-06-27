import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const TRAINING_COST: Record<number, number> = { 1: 8_000, 2: 12_000, 3: 18_000, 4: 24_000, 5: 35_000 };
const TRAINING_TICKS: Record<number, number> = { 1: 3, 2: 5, 3: 7, 4: 10, 5: 15 };

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { employeeId?: string };
  if (!body.employeeId) return NextResponse.json({ error: "employeeId обов'язковий" }, { status: 400 });

  const employee = await prisma.employee.findFirst({
    where:   { id: body.employeeId, playerId: session.user.id },
    select:  { id: true, firstName: true, lastName: true, qualificationLevel: true,
                trainingSessions: { where: { isCompleted: false }, take: 1 } },
  });
  if (!employee) return NextResponse.json({ error: "Працівника не знайдено" }, { status: 404 });
  if (employee.trainingSessions.length > 0) return NextResponse.json({ error: "Вже є активне навчання для цього працівника" }, { status: 409 });

  const nextLevel = employee.qualificationLevel + 1;
  if (nextLevel > 5) return NextResponse.json({ error: "Максимальний рівень кваліфікації (5) вже досягнуто" }, { status: 400 });

  const cost  = TRAINING_COST[nextLevel];
  const ticks = TRAINING_TICKS[nextLevel];

  const player = await prisma.player.findUnique({ where: { id: session.user.id }, select: { cashBalance: true } });
  if (!player || Number(player.cashBalance) < cost) {
    return NextResponse.json({ error: `Недостатньо коштів. Потрібно ₴${cost.toLocaleString("uk-UA")}.` }, { status: 422 });
  }

  const tick = await prisma.gameTick.findFirst({ orderBy: { tickNumber: "desc" }, select: { tickNumber: true } });

  await prisma.$transaction([
    prisma.player.update({ where: { id: session.user.id }, data: { cashBalance: { decrement: cost } } }),
    prisma.trainingSession.create({
      data: {
        employeeId:     body.employeeId,
        playerId:       session.user.id,
        targetLevel:    nextLevel,
        costUah:        cost,
        ticksRequired:  ticks,
        ticksRemaining: ticks,
      },
    }),
    prisma.financialLog.create({
      data: {
        playerId:    session.user.id,
        category:    "EXPENSE_MAINTENANCE",
        amountUah:   -cost,
        description: `Навчання: ${employee.firstName} ${employee.lastName} → рівень ${nextLevel}`,
        tickNumber:  tick?.tickNumber ?? 0n,
      },
    }),
  ]);

  return NextResponse.json({ ok: true, targetLevel: nextLevel, ticks, cost, message: `Навчання розпочато. Завершення через ${ticks} тіків.` });
}
