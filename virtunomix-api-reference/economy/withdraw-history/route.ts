import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/economy/withdraw-history
// Returns wallet balances + withdrawal history for the current user

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const [wallet, withdrawals] = await Promise.all([
    prisma.userWallet.findUnique({ where: { userId } }),
    prisma.withdrawalRequest.findMany({
      where  : { userId },
      orderBy: { createdAt: "desc" },
      take   : 50,
      select : {
        id           : true,
        amountPC     : true,
        amountUSD    : true,
        payoutMethod : true,
        payoutAddress: true,
        status       : true,
        adminNote    : true,
        createdAt    : true,
        processedAt  : true,
      },
    }),
  ]);

  // Statistics
  const totalWithdrawn = withdrawals
    .filter((w) => w.status === "APPROVED" || w.status === "PROCESSING")
    .reduce((s, w) => s + Number(w.amountPC), 0);
  const totalUSD = withdrawals
    .filter((w) => w.status === "APPROVED" || w.status === "PROCESSING")
    .reduce((s, w) => s + Number(w.amountUSD), 0);

  return NextResponse.json({
    wallet: {
      gameCash   : Number(wallet?.gameCash    ?? 0),
      premiumCoin: Number(wallet?.premiumCoin ?? 0),
    },
    stats: {
      totalWithdrawnPC : totalWithdrawn,
      totalWithdrawnUSD: totalUSD,
      pendingCount     : withdrawals.filter((w) => w.status === "PENDING").length,
    },
    withdrawals: withdrawals.map((w) => ({
      id           : w.id,
      amountPC     : Number(w.amountPC),
      amountUSD    : Number(w.amountUSD),
      payoutMethod : w.payoutMethod,
      // Mask address for privacy: show first 6 + last 4 chars
      payoutAddress: maskAddress(w.payoutAddress),
      status       : w.status,
      adminNote    : w.adminNote,
      createdAt    : w.createdAt,
      processedAt  : w.processedAt,
    })),
  });
}

function maskAddress(addr: string): string {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
