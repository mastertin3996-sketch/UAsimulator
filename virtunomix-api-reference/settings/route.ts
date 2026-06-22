import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, username: true, level: true, createdAt: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const company = await prisma.company.findFirst({
    where: { ownerId: session.user.id },
    select: { id: true, name: true, slogan: true, logoUrl: true, brandLevel: true },
  });

  return NextResponse.json({ user, company: company ?? null });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { username, currentPassword, newPassword, companyName, companySlogan } = body;

  // ── Update username ──
  if (username !== undefined) {
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) {
      return NextResponse.json({ error: "Нікнейм: 3–24 символи, лише літери/цифри/_" }, { status: 400 });
    }
    const exists = await prisma.user.findFirst({
      where: { username, NOT: { id: session.user.id } },
    });
    if (exists) return NextResponse.json({ error: "Такий нікнейм вже зайнятий" }, { status: 409 });
    await prisma.user.update({ where: { id: session.user.id }, data: { username } });
  }

  // ── Change password ──
  if (newPassword !== undefined) {
    if (!currentPassword) {
      return NextResponse.json({ error: "Введіть поточний пароль" }, { status: 400 });
    }
    if (newPassword.length < 6) {
      return NextResponse.json({ error: "Новий пароль: мінімум 6 символів" }, { status: 400 });
    }
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { passwordHash: true },
    });
    const valid = user?.passwordHash
      ? await bcrypt.compare(currentPassword, user.passwordHash)
      : false;
    if (!valid) return NextResponse.json({ error: "Поточний пароль невірний" }, { status: 403 });

    const newHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: session.user.id }, data: { passwordHash: newHash } });
  }

  // ── Update company ──
  if (companyName !== undefined || companySlogan !== undefined) {
    const company = await prisma.company.findFirst({ where: { ownerId: session.user.id } });
    if (!company) return NextResponse.json({ error: "Компанія не знайдена" }, { status: 404 });

    if (companyName !== undefined) {
      if (companyName.length < 2 || companyName.length > 60) {
        return NextResponse.json({ error: "Назва компанії: 2–60 символів" }, { status: 400 });
      }
      const taken = await prisma.company.findFirst({
        where: { name: companyName, NOT: { id: company.id } },
      });
      if (taken) return NextResponse.json({ error: "Назва компанії вже зайнята" }, { status: 409 });
    }

    await prisma.company.update({
      where: { id: company.id },
      data: {
        ...(companyName   !== undefined ? { name:   companyName }   : {}),
        ...(companySlogan !== undefined ? { slogan: companySlogan ?? null } : {}),
      },
    });
  }

  return NextResponse.json({ ok: true });
}
