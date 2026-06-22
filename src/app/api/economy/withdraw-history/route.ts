import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const player = await prisma.player.findUnique({
    where: { id: session.user.id },
    select: { cashBalance: true, balanceUsd: true },
  });
  if (!player) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    wallet: {
      gameCash:    Number(player.cashBalance),
      premiumCoin: Number(player.balanceUsd),
    },
    stats: {
      totalWithdrawnPC:  0,
      totalWithdrawnUSD: 0,
      pendingCount:      0,
    },
    withdrawals: [],
  });
}
