import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AgroService } from "@/engine/AgroService";
import { Decimal } from "@prisma/client/runtime/library";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const contract = await prisma.grainForwardContract.findFirst({
    where: { id, playerId: session.user.id, status: "ACTIVE" },
    include: { product: { select: { nameUa: true } } },
  });
  if (!contract) return NextResponse.json({ error: "Контракт не знайдено або вже не активний" }, { status: 404 });

  const penalty = AgroService.calcForwardCancelPenalty(contract!.quantityUnits, Number(contract!.pricePerUnit));

  const playerBal = await prisma.player.findUnique({ where: { id: session.user.id }, select: { cashBalance: true } });
  const balanceBefore = new Decimal(playerBal!.cashBalance.toString());
  const balanceAfter  = balanceBefore.minus(penalty);

  await prisma.$transaction([
    prisma.grainForwardContract.update({
      where: { id: contract.id },
      data:  { status: "CANCELLED", penaltyPaid: penalty },
    }),
    prisma.player.update({
      where: { id: session.user.id },
      data:  { cashBalance: { decrement: penalty } },
    }),
    prisma.financialTransaction.create({
      data: {
        playerId:    session.user.id,
        type:        "TAX_PAYMENT",
        amountUah:   new Decimal(-penalty),
        balanceBefore,
        balanceAfter,
        description: `Штраф за скасування ф'ючерсу: ${contract.product.nameUa}`,
      },
    }),
  ]);

  return NextResponse.json({ message: `Ф'ючерс скасовано. Штраф: ₴${penalty.toLocaleString()}` });
}
