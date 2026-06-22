import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { email, username, companyName, password } = await req.json();

    if (!email || !username || !password) {
      return NextResponse.json({ error: "Всі поля обов'язкові" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Пароль мінімум 8 символів" }, { status: 400 });
    }
    if (username.length < 3 || username.length > 30) {
      return NextResponse.json({ error: "Нікнейм 3–30 символів" }, { status: 400 });
    }

    const existing = await prisma.player.findFirst({
      where: { OR: [{ email }, { username }] },
      select: { email: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: existing.email === email ? "Email вже зайнятий" : "Нікнейм вже зайнятий" },
        { status: 409 },
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const player = await prisma.player.create({
      data: {
        email,
        username,
        passwordHash,
        companyName: companyName?.trim() || `Компанія ${username}`,
        // initial balance: 500,000 UAH (default in schema)
      },
      select: { id: true, email: true, username: true, companyName: true },
    });

    return NextResponse.json({ player }, { status: 201 });
  } catch (error) {
    console.error("[REGISTER]", error);
    return NextResponse.json({ error: "Внутрішня помилка сервера" }, { status: 500 });
  }
}
