import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ offerId: string }> };

// POST — subscribe or unsubscribe
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { offerId } = await params;
  const playerId = session.user.id;
  const body = await req.json().catch(() => ({})) as { action?: "subscribe" | "unsubscribe" };

  const offer = await prisma.warehouseRentalOffer.findUnique({
    where:  { id: offerId },
    select: { ownerId: true, pricePerTick: true, isActive: true },
  });
  if (!offer || !offer.isActive) return NextResponse.json({ error: "Пропозицію не знайдено" }, { status: 404 });
  if (offer.ownerId === playerId) return NextResponse.json({ error: "Не можна орендувати власний склад" }, { status: 400 });

  const existing = await prisma.warehouseRentalSubscription.findUnique({
    where: { offerId_tenantId: { offerId, tenantId: playerId } },
  });

  if (body.action === "unsubscribe") {
    if (!existing || !existing.isActive) return NextResponse.json({ error: "Підписки не знайдено" }, { status: 404 });
    await prisma.warehouseRentalSubscription.update({ where: { id: existing.id }, data: { isActive: false } });
    return NextResponse.json({ ok: true, message: "Підписку скасовано" });
  }

  // subscribe
  const tick = await prisma.gameTick.findFirst({ orderBy: { tickNumber: "desc" }, select: { tickNumber: true } });
  const tickNumber = tick?.tickNumber ?? 0n;

  const player = await prisma.player.findUnique({ where: { id: playerId }, select: { cashBalance: true } });
  const firstPayment = Number(offer.pricePerTick);
  if (!player || Number(player.cashBalance) < firstPayment) {
    return NextResponse.json({ error: `Недостатньо коштів. Перша оплата ₴${firstPayment}/тік.` }, { status: 422 });
  }

  if (existing) {
    if (existing.isActive) return NextResponse.json({ error: "Вже маєте активну підписку" }, { status: 409 });
    await prisma.warehouseRentalSubscription.update({ where: { id: existing.id }, data: { isActive: true, startTick: tickNumber } });
  } else {
    await prisma.warehouseRentalSubscription.create({
      data: { offerId, tenantId: playerId, startTick: tickNumber },
    });
  }

  await prisma.notification.create({
    data: {
      playerId,
      type:  "MACRO_EVENT",
      title: "Склад орендовано",
      body:  `Успішно підключено оренду складу. Оплата ₴${firstPayment.toFixed(0)}/тік знімається автоматично.`,
    },
  }).catch(() => {});

  return NextResponse.json({ ok: true, message: "Підписку активовано" });
}

// DELETE — deactivate the offer (owner only)
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { offerId } = await params;

  const offer = await prisma.warehouseRentalOffer.findUnique({
    where: { id: offerId },
    select: { ownerId: true },
  });
  if (!offer || offer.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Не знайдено або недостатньо прав" }, { status: 403 });
  }

  await prisma.$transaction([
    prisma.warehouseRentalOffer.update({ where: { id: offerId }, data: { isActive: false } }),
    prisma.warehouseRentalSubscription.updateMany({ where: { offerId, isActive: true }, data: { isActive: false } }),
  ]);

  return NextResponse.json({ ok: true });
}
