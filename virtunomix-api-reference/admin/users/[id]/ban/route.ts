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
  if (id === session.user.id) return NextResponse.json({ error: "Не можна заблокувати себе" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id }, select: { isActive: true, email: true } });
  if (!user) return NextResponse.json({ error: "Користувача не знайдено" }, { status: 404 });

  const newActive = !user.isActive;
  await prisma.user.update({ where: { id }, data: { isActive: newActive } });

  logAudit({
    actorId : session.user.id,
    targetId: id,
    type    : "USER_FLAGGED",
    details : { action: newActive ? "UNBAN" : "BAN", targetEmail: user.email },
    ipAddress: req.headers.get("x-client-ip") ?? undefined,
  });

  return NextResponse.json({ ok: true, isActive: newActive });
}
