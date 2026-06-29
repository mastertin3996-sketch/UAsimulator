import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LivestockSpecies } from "@prisma/client";

type Params = { params: Promise<{ id: string }> };

const LIVESTOCK_CONFIG: Record<LivestockSpecies, {
  nameUa: string; pricePerHead: number; feedSkuPerTick: number; feedQtyPerHead: number;
  outputSku: string; outputQtyPerHead: number; outputDesc: string;
}> = {
  CATTLE:  { nameUa: "ВРХ (корови)",   pricePerHead: 18_000, feedSkuPerTick: 0.05, feedQtyPerHead: 0.05,  outputSku: "SF-MILK",   outputQtyPerHead: 10,  outputDesc: "молоко (л/голова/тік)" },
  PIGS:    { nameUa: "Свині",           pricePerHead:  5_500, feedSkuPerTick: 0.03, feedQtyPerHead: 0.03,  outputSku: "RM-PIGS",  outputQtyPerHead: 0,   outputDesc: "на забій (вручну)" },
  POULTRY: { nameUa: "Птиця (кури)",   pricePerHead:    180, feedSkuPerTick: 0.01, feedQtyPerHead: 0.01,  outputSku: "FG-EGGS",  outputQtyPerHead: 0.5, outputDesc: "яйця (десяток/голова/тік)" },
};

export async function GET(_: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: enterpriseId } = await params;
  const enterprise = await prisma.enterprise.findFirst({
    where: { id: enterpriseId, playerId: session.user.id, type: "AGRO_FARM" },
    select: { id: true },
  });
  if (!enterprise) return NextResponse.json({ error: "Підприємство не знайдено" }, { status: 404 });

  const herds = await prisma.livestockHerd.findMany({
    where: { enterpriseId },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    herds: herds.map(h => ({
      id:        h.id,
      species:   h.species,
      headCount: h.headCount,
      health:    h.health,
      ageInTicks: h.ageInTicks,
      feedSkippedTicks: h.feedSkippedTicks,
      config:    LIVESTOCK_CONFIG[h.species],
    })),
    catalog: Object.entries(LIVESTOCK_CONFIG).map(([species, cfg]) => ({ species, ...cfg })),
  });
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: enterpriseId } = await params;
  const enterprise = await prisma.enterprise.findFirst({
    where: { id: enterpriseId, playerId: session.user.id, type: "AGRO_FARM" },
    select: { id: true },
  });
  if (!enterprise) return NextResponse.json({ error: "Підприємство не знайдено" }, { status: 404 });

  const body = await req.json().catch(() => ({})) as { species?: LivestockSpecies; headCount?: number; action?: "slaughter"; herdId?: string };

  if (body.action === "slaughter") {
    return NextResponse.json(
      { error: "Використовуй /api/agro/slaughter для забою. Потрібне спеціальне обладнання." },
      { status: 400 },
    );
  }

  if (!body.species || !(body.species in LIVESTOCK_CONFIG) || !body.headCount || body.headCount < 1) {
    return NextResponse.json({ error: "species і headCount (>0) обов'язкові" }, { status: 400 });
  }

  const cfg  = LIVESTOCK_CONFIG[body.species];
  const cost = cfg.pricePerHead * body.headCount;
  const player = await prisma.player.findUnique({ where: { id: session.user.id }, select: { cashBalance: true } });
  if (!player || Number(player.cashBalance) < cost) {
    return NextResponse.json({ error: `Потрібно ₴${cost.toLocaleString("uk-UA")}` }, { status: 422 });
  }

  const tick = await prisma.gameTick.findFirst({ orderBy: { tickNumber: "desc" }, select: { tickNumber: true } });

  // Check if herd of same species exists → merge
  const existing = await prisma.livestockHerd.findFirst({ where: { enterpriseId, species: body.species } });
  await prisma.$transaction([
    existing
      ? prisma.livestockHerd.update({ where: { id: existing.id }, data: { headCount: { increment: body.headCount } } })
      : prisma.livestockHerd.create({ data: { enterpriseId, playerId: session.user.id, species: body.species, headCount: body.headCount } }),
    prisma.player.update({ where: { id: session.user.id }, data: { cashBalance: { decrement: cost } } }),
    prisma.financialLog.create({ data: { playerId: session.user.id, category: "EXPENSE_MAINTENANCE", amountUah: -cost, description: `Закупівля худоби: ${cfg.nameUa} ×${body.headCount}`, tickNumber: tick?.tickNumber ?? 0n } }),
  ]);

  return NextResponse.json({ ok: true, message: `${body.headCount} голів ${cfg.nameUa} придбано за ₴${cost.toLocaleString("uk-UA")}` });
}
