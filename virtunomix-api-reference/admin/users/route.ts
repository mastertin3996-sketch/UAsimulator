import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
  if (admin?.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const search = new URL(req.url).searchParams.get("search") ?? "";

  const users = await prisma.user.findMany({
    where: search
      ? { OR: [
          { email:    { contains: search, mode: "insensitive" } },
          { username: { contains: search, mode: "insensitive" } },
        ] }
      : undefined,
    orderBy: { createdAt: "desc" },
    take   : 100,
    select : {
      id: true, email: true, username: true, level: true,
      isActive: true, isFlagged: true, role: true,
      createdAt: true, lastLoginAt: true,
      wallet: { select: { gameCash: true, premiumCoin: true } },
      companies: {
        select: {
          name: true,
          _count: { select: { enterprises: true } },
        },
        take: 1,
      },
    },
  });

  return NextResponse.json({
    users: users.map((u) => ({
      id             : u.id,
      email          : u.email,
      username       : u.username,
      level          : u.level,
      isActive       : u.isActive,
      isFlagged      : u.isFlagged,
      role           : u.role,
      gcBalance      : Number(u.wallet?.gameCash   ?? 0),
      pcBalance      : Number(u.wallet?.premiumCoin ?? 0),
      createdAt      : u.createdAt.toISOString(),
      lastLoginAt    : u.lastLoginAt?.toISOString() ?? null,
      companyName    : u.companies[0]?.name ?? null,
      enterpriseCount: u.companies[0]?._count.enterprises ?? 0,
    })),
  });
}
