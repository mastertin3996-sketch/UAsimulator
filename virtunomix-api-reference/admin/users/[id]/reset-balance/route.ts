import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
  if (admin?.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  if (id === session.user.id) return NextResponse.json({ error: "Не можна обнулити свій баланс" }, { status: 400 });

  const wallet = await prisma.userWallet.findUnique({ where: { userId: id } });
  if (!wallet) return NextResponse.json({ error: "Гаманець не знайдено" }, { status: 404 });

  const prev = { gc: Number(wallet.gameCash), pc: Number(wallet.premiumCoin) };

  await prisma.userWallet.update({
    where: { userId: id },
    data : { gameCash: 0, premiumCoin: 0 },
  });

  logAudit({
    actorId : session.user.id,
    targetId: id,
    type    : "USER_FLAGGED",
    details : { action: "RESET_BALANCE", prevGC: prev.gc, prevPC: prev.pc },
    ipAddress: req.headers.get("x-client-ip") ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
