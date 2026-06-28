import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SeedQuality } from "@prisma/client";

const SEED_PRICES: Record<string, number> = { BASIC: 0, STANDARD: 0, PREMIUM: 5000 };

// PATCH /api/agro/seed-quality  { enterpriseId, seedQuality: "BASIC"|"STANDARD"|"PREMIUM" }
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const playerId = session.user.id;

  const { enterpriseId, seedQuality: rawQuality } = await req.json().catch(() => ({})) as { enterpriseId?: string; seedQuality?: string };
  if (!enterpriseId || !rawQuality) return NextResponse.json({ error: "enterpriseId і seedQuality required" }, { status: 400 });
  if (!['BASIC', 'STANDARD', 'PREMIUM'].includes(rawQuality)) return NextResponse.json({ error: "Недійсна якість насіння" }, { status: 400 });
  const seedQuality = rawQuality as SeedQuality;

  const enterprise = await prisma.enterprise.findFirst({
    where: { id: enterpriseId, playerId, type: "AGRO_FARM", isOperational: true },
    select: { id: true, landPlot: { select: { id: true, seedQuality: true } } },
  });
  if (!enterprise?.landPlot) return NextResponse.json({ error: "Ферму не знайдено" }, { status: 404 });

  const cost = SEED_PRICES[seedQuality] ?? 0;
  if (cost > 0) {
    const player = await prisma.player.findUnique({ where: { id: playerId }, select: { id: true, cashBalance: true } });
    if (!player || Number(player.cashBalance) < cost) {
      return NextResponse.json({ error: `Недостатньо коштів. Потрібно ₴${cost.toLocaleString('uk-UA')}` }, { status: 400 });
    }
    const before = Number(player.cashBalance);
    await prisma.$transaction([
      prisma.player.update({ where: { id: playerId }, data: { cashBalance: { decrement: cost } } }),
      prisma.landPlot.update({ where: { id: enterprise.landPlot.id }, data: { seedQuality } }),
      prisma.financialTransaction.create({ data: {
        playerId, type: 'MARKET_PURCHASE',
        amountUah: -cost, balanceBefore: before, balanceAfter: before - cost,
        description: `Преміум насіння (PREMIUM) для ферми ${enterpriseId}`,
      } }),
    ]);
  } else {
    await prisma.landPlot.update({ where: { id: enterprise.landPlot.id }, data: { seedQuality } });
  }

  return NextResponse.json({ ok: true, seedQuality, costPaid: cost });
}
