import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;

  const [player, withdrawals] = await Promise.all([
    prisma.player.findUniqueOrThrow({
      where:  { id: playerId },
      select: { cashBalance: true, balanceUsd: true },
    }),
    prisma.withdrawalRequest.findMany({
      where:   { playerId },
      orderBy: { createdAt: "desc" },
      take:    50,
      select: {
        id: true, amountPC: true, amountUSD: true,
        payoutMethod: true, payoutAddress: true,
        status: true, adminNote: true, createdAt: true, processedAt: true,
      },
    }),
  ]);

  const totalWithdrawnPC  = withdrawals.filter(w => w.status === "APPROVED").reduce((s, w) => s + w.amountPC, 0);
  const totalWithdrawnUSD = withdrawals.filter(w => w.status === "APPROVED").reduce((s, w) => s + w.amountUSD, 0);
  const pendingCount      = withdrawals.filter(w => w.status === "PENDING" || w.status === "PROCESSING").length;

  return NextResponse.json({
    wallet: {
      gameCash:    Number(player.cashBalance),
      premiumCoin: Number(player.balanceUsd),
    },
    stats: { totalWithdrawnPC, totalWithdrawnUSD, pendingCount },
    withdrawals: withdrawals.map(w => ({
      id:            w.id,
      amountPC:      w.amountPC,
      amountUSD:     w.amountUSD,
      payoutMethod:  w.payoutMethod,
      payoutAddress: w.payoutAddress,
      status:        w.status,
      adminNote:     w.adminNote,
      createdAt:     w.createdAt.toISOString(),
      processedAt:   w.processedAt?.toISOString() ?? null,
    })),
  });
}
