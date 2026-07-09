import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { allowRate } from "@/lib/rateLimit";

const registerSchema = z.object({
  email:       z.string().min(1),
  username:    z.string().min(3).max(30),
  companyName: z.string().optional(),
  password:    z.string().min(8),
});

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!(await allowRate(`register:${ip}`, 10_000))) {
      return NextResponse.json({ error: "Забагато запитів — спробуйте за кілька секунд" }, { status: 429 });
    }

    const rawBody = await req.json().catch(() => null);
    const parsed  = registerSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: "Всі поля обов'язкові" }, { status: 400 });
    }
    const { email, username, companyName, password } = parsed.data;

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
