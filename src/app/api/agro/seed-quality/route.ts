import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const SEED_PRICES: Record<string, number> = { BASIC: 0, STANDARD: 0, PREMIUM: 5000 };

const seedQualitySchema = z.object({
  enterpriseId: z.string().min(1),
  seedQuality:  z.enum(['BASIC', 'STANDARD', 'PREMIUM']),
});

// PATCH /api/agro/seed-quality  { enterpriseId, seedQuality: "BASIC"|"STANDARD"|"PREMIUM" }
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const playerId = session.user.id;

  const rawBody = await req.json().catch(() => ({}));
  const parsed  = seedQualitySchema.safeParse(rawBody);
  if (!parsed.success) return NextResponse.json({ error: "enterpriseId і дійсний seedQuality required" }, { status: 400 });
  const { enterpriseId, seedQuality } = parsed.data;

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
