import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const player = await prisma.player.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, username: true, createdAt: true, companyName: true, reputationScore: true, enterprises: { select: { id: true } } },
  });
  if (!player) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const level     = Math.min(50, Math.max(1, Math.floor(player.enterprises.length * 1.5 + player.reputationScore)));
  const brandLevel = Math.min(5, Math.max(1, Math.floor(player.reputationScore / 2)));

  return NextResponse.json({
    user: {
      id: player.id, email: player.email, username: player.username,
      level, createdAt: player.createdAt.toISOString(),
    },
    company: {
      id: player.id, name: player.companyName, slogan: null, brandLevel,
    },
  });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;
  const body = await req.json();

  // Password change
  if (body.currentPassword && body.newPassword) {
    if (body.newPassword.length < 6) {
      return NextResponse.json({ error: "Пароль мінімум 6 символів" }, { status: 400 });
    }
    const player = await prisma.player.findUnique({ where: { id: playerId }, select: { passwordHash: true } });
    if (!player) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const valid = await bcrypt.compare(body.currentPassword, player.passwordHash);
    if (!valid) return NextResponse.json({ error: "Невірний поточний пароль" }, { status: 400 });
    const newHash = await bcrypt.hash(body.newPassword, 12);
    await prisma.player.update({ where: { id: playerId }, data: { passwordHash: newHash } });
    return NextResponse.json({ ok: true });
  }

  const data: Record<string, unknown> = {};

  // Username update
  if (body.username !== undefined) {
    const name = String(body.username).trim();
    if (name.length < 3 || name.length > 24) {
      return NextResponse.json({ error: "Нікнейм 3–24 символи" }, { status: 400 });
    }
    const existing = await prisma.player.findFirst({ where: { username: name, NOT: { id: playerId } } });
    if (existing) return NextResponse.json({ error: "Нікнейм зайнятий" }, { status: 409 });
    data.username = name;
  }

  // Company name / slogan
  if (body.companyName !== undefined) {
    const n = String(body.companyName).trim();
    if (n.length < 2 || n.length > 60) return NextResponse.json({ error: "Назва 2–60 символів" }, { status: 400 });
    data.companyName = n;
  }

  if (Object.keys(data).length === 0) return NextResponse.json({ ok: true });

  await prisma.player.update({ where: { id: playerId }, data });
  return NextResponse.json({ ok: true });
}
