import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Profession } from "@prisma/client";

type Params = { params: Promise<{ id: string }> };

// PATCH — update salary OR resolve strikes
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: enterpriseId } = await params;
  const playerId = session.user.id;
  const body = await req.json();

  const enterprise = await prisma.enterprise.findFirst({ where: { id: enterpriseId, playerId } });
  if (!enterprise) return NextResponse.json({ error: "Підприємство не знайдено" }, { status: 404 });

  // ── Resolve strikes (manual settlement bonus ₴500/person) ────────────────
  if (body.action === "resolveStrike") {
    const strikers = await prisma.employee.findMany({
      where: { enterpriseId, isOnStrike: true },
      select: { id: true },
    });
    if (strikers.length === 0) return NextResponse.json({ ok: true, resolved: 0 });

    const bonusPerPerson = 500;
    const totalBonus     = strikers.length * bonusPerPerson;

    const player = await prisma.player.findUnique({ where: { id: playerId }, select: { cashBalance: true } });
    if (!player || Number(player.cashBalance) < totalBonus) {
      return NextResponse.json({ error: `Недостатньо коштів (потрібно ₴${totalBonus})` }, { status: 400 });
    }

    await prisma.$transaction([
      prisma.employee.updateMany({
        where: { enterpriseId, isOnStrike: true },
        data:  { isOnStrike: false, strikeStartedTick: null, mood: { increment: 0.15 } },
      }),
      prisma.player.update({
        where: { id: playerId },
        data:  { cashBalance: { decrement: totalBonus } },
      }),
    ]);

    return NextResponse.json({ ok: true, resolved: strikers.length, cost: totalBonus });
  }

  // ── Update salary for profession ──────────────────────────────────────────
  const { roleId, salary } = body;
  if (!roleId || !salary || salary <= 0) {
    return NextResponse.json({ error: "Невірні параметри" }, { status: 400 });
  }

  await prisma.employee.updateMany({
    where: { enterpriseId, profession: roleId as Profession },
    data: { salaryUah: salary },
  });

  return NextResponse.json({ ok: true });
}
