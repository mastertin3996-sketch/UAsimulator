import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      wallet: true,
      companies: {
        include: {
          enterprises: {
            where: { isActive: true },
            include: {
              enterpriseType: { select: { name: true, category: true, icon: true } },
              city: { select: { name: true } },
            },
            orderBy: { createdAt: "asc" },
          },
        },
        take: 1,
      },
    },
  });

  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const company = user.companies[0] ?? null;

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      level: user.level,
    },
    wallet: user.wallet
      ? { gameCash: Number(user.wallet.gameCash), premiumCoin: Number(user.wallet.premiumCoin) }
      : null,
    company: company
      ? {
          id: company.id,
          name: company.name,
          slogan: company.slogan,
          rating: Number(company.rating),
          brandLevel: company.brandLevel,
          totalAssets: Number(company.totalAssets),
          enterprisesCount: company.enterprises.length,
          enterprises: company.enterprises.map((e) => ({
            id: e.id,
            name: e.name,
            typeName: e.enterpriseType.name,
            category: e.enterpriseType.category,
            icon: e.enterpriseType.icon,
            city: e.city.name,
            level: e.level,
            efficiency: Number(e.efficiency),
          })),
        }
      : null,
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, slogan } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Назва обов'язкова" }, { status: 400 });

  const existing = await prisma.company.findFirst({ where: { ownerId: session.user.id } });
  if (existing) return NextResponse.json({ error: "Компанія вже існує" }, { status: 409 });

  const nameExists = await prisma.company.findUnique({ where: { name: name.trim() } });
  if (nameExists) return NextResponse.json({ error: "Така назва вже зайнята" }, { status: 409 });

  const company = await prisma.company.create({
    data: {
      ownerId: session.user.id,
      name: name.trim(),
      slogan: slogan?.trim() || null,
    },
  });

  return NextResponse.json({ company }, { status: 201 });
}
