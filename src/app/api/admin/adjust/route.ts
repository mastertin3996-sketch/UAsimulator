import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as {
    playerId?: string; amountUah?: number; reason?: string;
  };

  if (!body.playerId) return NextResponse.json({ error: "Потрібен playerId" }, { status: 400 });
  if (typeof body.amountUah !== "number" || body.amountUah === 0) {
    return NextResponse.json({ error: "Потрібна сума (не нуль)" }, { status: 400 });
  }

  const player = await prisma.player.findUnique({
    where:  { id: body.playerId },
    select: { id: true, cashBalance: true, companyName: true },
  });
  if (!player) return NextResponse.json({ error: "Гравця не знайдено" }, { status: 404 });

  const amount = new Decimal(body.amountUah);
  const before = new Decimal(player.cashBalance.toString());
  const after  = before.plus(amount);

  await prisma.$transaction([
    prisma.player.update({
      where: { id: body.playerId },
      data:  { cashBalance: after },
    }),
    prisma.financialTransaction.create({
      data: {
        playerId:      body.playerId,
        type:          "GM_ADJUSTMENT",
        amountUah:     amount,
        balanceBefore: before,
        balanceAfter:  after,
        description:   body.reason ?? `GM коригування (${session.user.id})`,
      },
    }),
  ]);

  return NextResponse.json({
    ok:          true,
    companyName: player.companyName,
    amountUah:   body.amountUah,
    newBalance:  Number(after),
  });
}
