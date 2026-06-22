import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function assertAdmin(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  return user?.role === "ADMIN";
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await assertAdmin(session.user.id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [
    walletAgg,
    activeUsers,
    totalUsers,
    totalEnterprises,
    contractsActive,
    contractsTotal,
    flaggedUsers,
    openAlerts,
    lastTick,
  ] = await Promise.all([
    prisma.userWallet.aggregate({ _sum: { gameCash: true, premiumCoin: true } }),
    prisma.user.count({ where: { isActive: true } }),
    prisma.user.count(),
    prisma.enterprise.count({ where: { isActive: true } }),
    prisma.supplyContract.count({ where: { status: "ACTIVE" } }),
    prisma.supplyContract.count(),
    prisma.user.count({ where: { isFlagged: true } }),
    prisma.securityAlert.count({ where: { status: "OPEN" } }),
    prisma.gameTick.findFirst({ orderBy: { tickNumber: "desc" }, select: { tickNumber: true } }),
  ]);

  return NextResponse.json({
    totalGC          : Number(walletAgg._sum.gameCash   ?? 0),
    totalPC          : Number(walletAgg._sum.premiumCoin ?? 0),
    activeUsers,
    totalUsers,
    totalEnterprises,
    contractsActive,
    contractsTotal,
    flaggedUsers,
    openAlerts,
    currentTick      : lastTick?.tickNumber ?? 0,
  });
}
