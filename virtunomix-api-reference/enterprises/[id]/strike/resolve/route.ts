import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const ent = await prisma.enterprise.findFirst({
    where  : { id, company: { ownerId: session.user.id } },
    include: { company: { select: { id: true, ownerId: true } } },
  });
  if (!ent) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (ent.strikeEndsAt === null) {
    return NextResponse.json({ error: "No active strike" }, { status: 400 });
  }

  const body = await req.json() as
    | { type: "bonus"; amount: number }
    | { type: "raise"; newSalary: number };

  if (body.type === "bonus") {
    const amount = Number(body.amount);
    if (amount <= 0) return NextResponse.json({ error: "amount must be > 0" }, { status: 400 });

    const wallet = await prisma.userWallet.findUnique({
      where : { userId: session.user.id },
      select: { gameCash: true },
    });
    if (Number(wallet?.gameCash ?? 0) < amount) {
      return NextResponse.json({ error: "Недостатньо коштів" }, { status: 400 });
    }

    // Last tick number for balanceAfter
    const lastTick = await prisma.gameTick.findFirst({ orderBy: { tickNumber: "desc" }, select: { id: true } });

    await prisma.$transaction([
      prisma.userWallet.update({
        where: { userId: session.user.id },
        data : { gameCash: { decrement: amount } },
      }),
      prisma.enterprise.update({
        where: { id },
        data : { strikeEndsAt: null },
      }),
      prisma.financialTransaction.create({
        data: {
          companyId  : ent.company.id,
          tickId     : lastTick?.id,
          type       : "SALARY",
          currency   : "GAME_CASH",
          amount     : -amount,
          balanceAfter: Number(wallet!.gameCash) - amount,
          description: `Разова премія для врегулювання страйку: ${ent.name}`,
          relatedEntityId: id,
        },
      }),
      prisma.notification.create({
        data: {
          userId      : session.user.id,
          type        : "STRIKE_RESOLVED",
          title       : "Страйк завершено",
          body        : `Страйк на "${ent.name}" врегульовано: виплачено разову премію ${amount.toLocaleString("uk-UA")} GC.`,
          enterpriseId: id,
        },
      }),
    ]);

    return NextResponse.json({ ok: true, method: "bonus" });
  }

  if (body.type === "raise") {
    const newSalary = Number(body.newSalary);
    if (newSalary <= 0) return NextResponse.json({ error: "newSalary must be > 0" }, { status: 400 });
    if (newSalary <= Number(ent.salaryOffered)) {
      return NextResponse.json({ error: "Нова зарплата має бути вищою за поточну" }, { status: 400 });
    }

    await prisma.$transaction([
      prisma.enterprise.update({
        where: { id },
        data : { salaryOffered: newSalary, strikeEndsAt: null },
      }),
      prisma.notification.create({
        data: {
          userId      : session.user.id,
          type        : "STRIKE_RESOLVED",
          title       : "Страйк завершено",
          body        : `Страйк на "${ent.name}" врегульовано: зарплату підвищено до ${newSalary.toLocaleString("uk-UA")} GC/тік.`,
          enterpriseId: id,
        },
      }),
    ]);

    return NextResponse.json({ ok: true, method: "raise" });
  }

  return NextResponse.json({ error: "type must be bonus or raise" }, { status: 400 });
}
