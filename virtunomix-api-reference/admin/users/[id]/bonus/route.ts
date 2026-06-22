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
  const { amount, currency, reason } = await req.json() as {
    amount  : number;
    currency: "GC" | "PC";
    reason  : string;
  };

  if (amount <= 0)                        return NextResponse.json({ error: "Amount must be > 0" }, { status: 400 });
  if (!["GC", "PC"].includes(currency))  return NextResponse.json({ error: "Invalid currency" }, { status: 400 });

  const field = currency === "GC" ? "gameCash" : "premiumCoin";
  const wallet = await prisma.userWallet.update({
    where: { userId: id },
    data : { [field]: { increment: amount } },
  });

  logAudit({
    actorId : session.user.id,
    targetId: id,
    type    : "USER_FLAGGED",
    amount,
    currency: currency === "GC" ? "GAME_CASH" : "PREMIUM_COIN",
    details : { action: "BONUS", amount, currency, reason },
    ipAddress: req.headers.get("x-client-ip") ?? undefined,
  });

  return NextResponse.json({
    ok        : true,
    newBalance: Number(currency === "GC" ? wallet.gameCash : wallet.premiumCoin),
  });
}
