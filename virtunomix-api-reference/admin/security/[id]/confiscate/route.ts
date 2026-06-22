import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAuditInTx } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const adminId = session.user.id;
  const admin = await prisma.user.findUnique({ where: { id: adminId }, select: { role: true } });
  if (admin?.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: alertId } = await params;

  const alert = await prisma.securityAlert.findUnique({ where: { id: alertId } });
  if (!alert) return NextResponse.json({ error: "Алерт не знайдено" }, { status: 404 });
  if (alert.status === "RESOLVED" || alert.status === "DISMISSED") {
    return NextResponse.json({ error: "Алерт вже закрито" }, { status: 409 });
  }

  // Zero-out GC for the primary actor (the offender); keep PC for play-to-earn compliance
  const targetWallet = await prisma.userWallet.findUnique({
    where : { userId: alert.actorId },
    select: { gameCash: true },
  });
  const confiscatedGC = Number(targetWallet?.gameCash ?? 0);

  await prisma.$transaction(async (tx) => {
    if (confiscatedGC > 0) {
      await tx.userWallet.update({
        where: { userId: alert.actorId },
        data : { gameCash: 0 },
      });
    }

    await tx.securityAlert.update({
      where: { id: alertId },
      data : {
        status    : "RESOLVED",
        resolvedBy: adminId,
        resolvedAt: new Date(),
      },
    });

    await tx.user.update({
      where: { id: alert.actorId },
      data : { isFlagged: false },
    });

    await logAuditInTx(tx, {
      actorId : adminId,
      targetId: alert.actorId,
      type    : "SUSPICIOUS_BLOCKED",
      amount  : confiscatedGC,
      currency: "GAME_CASH",
      relatedId: alertId,
      details : {
        action       : "CONFISCATE",
        confiscatedGC,
        alertType    : alert.type,
        adminId      : adminId,
      },
      ipAddress: req.headers.get("x-client-ip") ?? undefined,
    });
  });

  return NextResponse.json({ ok: true, confiscatedGC });
}
