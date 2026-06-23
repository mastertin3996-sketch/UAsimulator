import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const player = await prisma.player.findUniqueOrThrow({
    where: { id: session.user.id },
    select: {
      id: true, companyName: true, cashBalance: true, balanceUsd: true,
      creditRating: true, netWorth: true, companyValuationUah: true,
    },
  });

  return NextResponse.json({
    id:                  player.id,
    companyName:         player.companyName,
    cashBalance:         Number(player.cashBalance),
    balanceUsd:          Number(player.balanceUsd),
    creditRating:        player.creditRating,
    netWorth:            Number(player.netWorth),
    companyValuationUah: Number(player.companyValuationUah),
  });
}
