import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PayoutMethod } from "@prisma/client";

const PC_TO_USD = 0.01;
const MIN_PC    = 100;

const withdrawSchema = z.object({
  amountPC:      z.number().finite().min(MIN_PC),
  payoutMethod:  z.enum(["USDT_TRC20", "USDT_ERC20", "PAYPAL"]),
  payoutAddress: z.string().trim().min(1),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;

  const rawBody = await req.json().catch(() => null);
  const parsed  = withdrawSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: `Мінімальна сума виведення — ${MIN_PC} PC` }, { status: 400 });
  }
  const body = parsed.data;

  const player = await prisma.player.findUniqueOrThrow({
    where:  { id: playerId },
    select: { balanceUsd: true },
  });

  const pcBalance = Number(player.balanceUsd);
  if (pcBalance < body.amountPC) {
    return NextResponse.json({
      error: `Недостатньо PremiumCoin: є ${pcBalance.toFixed(2)} PC, потрібно ${body.amountPC}`,
    }, { status: 400 });
  }

  const amountUSD = parseFloat((body.amountPC * PC_TO_USD).toFixed(2));

  // Deduct PC from balance
  await prisma.player.update({
    where: { id: playerId },
    data:  { balanceUsd: { decrement: body.amountPC } },
  });

  // Create withdrawal request
  const request = await prisma.withdrawalRequest.create({
    data: {
      playerId,
      amountPC:      body.amountPC,
      amountUSD,
      payoutMethod:  body.payoutMethod as PayoutMethod,
      payoutAddress: body.payoutAddress.trim(),
    },
  });

  return NextResponse.json({
    ok:        true,
    requestId: request.id,
    amountPC:  body.amountPC,
    amountUSD,
    status:    "PENDING",
  }, { status: 201 });
}
