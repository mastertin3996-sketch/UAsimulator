import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const adminId = session.user.id;
  const admin = await prisma.user.findUnique({ where: { id: adminId }, select: { role: true } });
  if (admin?.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { operation, currency, amount, reason } = await req.json() as {
    operation: "EMIT" | "BURN";
    currency : "GC" | "PC";
    amount   : number;
    reason   : string;
  };

  if (!["EMIT", "BURN"].includes(operation)) return NextResponse.json({ error: "Invalid operation" }, { status: 400 });
  if (!["GC", "PC"].includes(currency))       return NextResponse.json({ error: "Invalid currency" }, { status: 400 });
  if (amount <= 0 || amount > 1_000_000_000)  return NextResponse.json({ error: "Amount out of range" }, { status: 400 });
  if (!reason?.trim())                         return NextResponse.json({ error: "Reason is required" }, { status: 400 });

  const field = currency === "GC" ? "gameCash" : "premiumCoin";

  let affected = 0;
  let totalDelta = 0;

  if (operation === "EMIT") {
    const result = await prisma.userWallet.updateMany({
      where: { user: { isActive: true } },
      data : { [field]: { increment: amount } },
    });
    affected   = result.count;
    totalDelta = amount * affected;
  } else {
    // BURN: deduct min(amount, balance) per user — UserWallet PK is userId
    const wallets = await prisma.userWallet.findMany({
      where : { user: { isActive: true } },
      select: { userId: true, gameCash: true, premiumCoin: true },
    });

    const ops = wallets
      .map((w) => {
        const current = Number(currency === "GC" ? w.gameCash : w.premiumCoin);
        const deduct  = Math.min(amount, current);
        if (deduct <= 0) return null;
        totalDelta += deduct;
        return prisma.userWallet.update({
          where: { userId: w.userId },
          data : { [field]: { decrement: deduct } },
        });
      })
      .filter((op): op is NonNullable<typeof op> => op !== null);

    if (ops.length > 0) await prisma.$transaction(ops);
    affected = ops.length;
  }

  logAudit({
    actorId : adminId,
    type    : "USER_FLAGGED",
    details : { operation, currency, amount, reason, affected, totalDelta },
    ipAddress: req.headers.get("x-client-ip") ?? undefined,
  });

  return NextResponse.json({ ok: true, affected, totalDelta });
}
