import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MachineryType } from "@prisma/client";

type Params = { params: Promise<{ id: string }> };

const MACHINERY_CONFIG: Record<MachineryType, { nameUa: string; price: number; rentPerTick: number; yieldBonus: number }> = {
  TRACTOR:          { nameUa: "Трактор",       price: 180_000, rentPerTick: 350, yieldBonus: 0.20 },
  COMBINE_HARVESTER:{ nameUa: "Комбайн",        price: 350_000, rentPerTick: 700, yieldBonus: 0.30 },
  SEEDER:           { nameUa: "Сівалка",        price:  90_000, rentPerTick: 180, yieldBonus: 0.10 },
  SPRAYER:          { nameUa: "Обприскувач",    price:  75_000, rentPerTick: 150, yieldBonus: 0.05 },
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

  const machinery = await prisma.farmMachinery.findMany({
    where: { enterpriseId },
    orderBy: { purchasedAt: "asc" },
  });

  return NextResponse.json({
    machinery: machinery.map(m => ({
      id:           m.id,
      type:         m.machineryType,
      name:         m.name,
      durability:   m.durability,
      isRented:     m.isRented,
      isOperational:m.isOperational,
      rentCostPerTick: m.rentCostPerTick ? Number(m.rentCostPerTick) : null,
      lastRepairAt: m.lastRepairAt,
    })),
    catalog: Object.entries(MACHINERY_CONFIG).map(([type, cfg]) => ({
      type, ...cfg,
    })),
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

  const body = await req.json().catch(() => ({})) as { action?: string; machineryType?: MachineryType; machineryId?: string; isRent?: boolean };

  if (body.action === "repair") {
    const m = await prisma.farmMachinery.findFirst({ where: { id: body.machineryId, enterpriseId } });
    if (!m) return NextResponse.json({ error: "Техніку не знайдено" }, { status: 404 });
    const cfg   = MACHINERY_CONFIG[m.machineryType];
    const cost  = Math.round(cfg.price * 0.20);
    const player = await prisma.player.findUnique({ where: { id: session.user.id }, select: { cashBalance: true } });
    if (!player || Number(player.cashBalance) < cost) return NextResponse.json({ error: `Потрібно ₴${cost.toLocaleString("uk-UA")} на ремонт` }, { status: 422 });

    const tick = await prisma.gameTick.findFirst({ orderBy: { tickNumber: "desc" }, select: { tickNumber: true } });
    await prisma.$transaction([
      prisma.farmMachinery.update({ where: { id: m.id }, data: { durability: 1.0, isOperational: true, lastRepairAt: new Date() } }),
      prisma.player.update({ where: { id: session.user.id }, data: { cashBalance: { decrement: cost } } }),
      prisma.financialLog.create({ data: { playerId: session.user.id, category: "EXPENSE_MAINTENANCE", amountUah: -cost, description: `Ремонт: ${m.name}`, tickNumber: tick?.tickNumber ?? 0n } }),
    ]);
    return NextResponse.json({ ok: true, message: `${m.name} відремонтовано за ₴${cost.toLocaleString("uk-UA")}` });
  }

  // buy or rent
  if (!body.machineryType || !(body.machineryType in MACHINERY_CONFIG)) {
    return NextResponse.json({ error: "machineryType обов'язковий" }, { status: 400 });
  }
  const cfg    = MACHINERY_CONFIG[body.machineryType];
  const isRent = !!body.isRent;
  const cost   = isRent ? cfg.rentPerTick * 30 : cfg.price; // rent = 30-tick deposit

  const player = await prisma.player.findUnique({ where: { id: session.user.id }, select: { cashBalance: true } });
  if (!player || Number(player.cashBalance) < cost) {
    return NextResponse.json({ error: `Потрібно ₴${cost.toLocaleString("uk-UA")}` }, { status: 422 });
  }

  const tick = await prisma.gameTick.findFirst({ orderBy: { tickNumber: "desc" }, select: { tickNumber: true } });
  await prisma.$transaction([
    prisma.farmMachinery.create({
      data: {
        enterpriseId, playerId: session.user.id,
        machineryType:   body.machineryType,
        name:            cfg.nameUa,
        purchasePriceUah: cost,
        isRented:        isRent,
        rentCostPerTick: isRent ? cfg.rentPerTick : null,
      },
    }),
    prisma.player.update({ where: { id: session.user.id }, data: { cashBalance: { decrement: cost } } }),
    prisma.financialLog.create({ data: { playerId: session.user.id, category: "EXPENSE_MAINTENANCE", amountUah: -cost, description: `${isRent ? "Оренда" : "Купівля"}: ${cfg.nameUa}`, tickNumber: tick?.tickNumber ?? 0n } }),
  ]);

  return NextResponse.json({ ok: true, message: `${cfg.nameUa} ${isRent ? "орендовано" : "придбано"} за ₴${cost.toLocaleString("uk-UA")}` });
}
