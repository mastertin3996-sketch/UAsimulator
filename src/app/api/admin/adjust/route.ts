import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";

const adjustSchema = z.object({
  playerId:  z.string().min(1),
  amountUah: z.number().finite().refine(v => v !== 0, "amountUah must not be zero"),
  reason:    z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rawBody = await req.json().catch(() => null);
  const parsed  = adjustSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Потрібен playerId та сума amountUah (число, не нуль)" }, { status: 400 });
  }
  const body = parsed.data;

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
