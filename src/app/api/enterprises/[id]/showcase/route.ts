import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: enterpriseId } = await params;
  const playerId = session.user.id;

  const enterprise = await prisma.enterprise.findFirst({
    where: { id: enterpriseId, playerId },
    select: {
      type:             true,
      totalFloorAreaM2: true,
      landPlot: { select: { city: { select: { id: true, nameUa: true } } } },
      inventory: {
        select: {
          productId: true, quantity: true, avgQuality: true,
          product: { select: { baseWeightKg: true } },
        },
      },
      retailListings: { select: { productId: true, pricePerUnit: true, isActive: true } },
    },
  });
  if (!enterprise) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const cityId = enterprise.landPlot.city.id;

  const demands = await prisma.npcDemand.findMany({
    where: { cityId },
    orderBy: { baseUnitsPerDay: "desc" },
    select: {
      baseUnitsPerDay: true,
      referencePrice: true,
      priceElasticity: true,
      product: { select: { id: true, sku: true, nameUa: true, unit: true } },
    },
  });

  const KG_PER_M2  = 100;
  const capacityKg = enterprise.totalFloorAreaM2 * KG_PER_M2;
  const usedKg     = enterprise.inventory.reduce((sum, i) => sum + Number(i.quantity) * (i.product.baseWeightKg ?? 1), 0);

  const invMap     = new Map(enterprise.inventory.map(i => [i.productId, { quantity: Number(i.quantity), avgQuality: i.avgQuality }]));
  const listingMap = new Map(enterprise.retailListings.map(l => [l.productId, { price: Number(l.pricePerUnit), isActive: l.isActive }]));

  const items = demands.map(d => {
    const listing     = listingMap.get(d.product.id);
    const refPrice    = Number(d.referencePrice);
    const playerPrice = listing?.price ?? null;

    let estimatedDemand = d.baseUnitsPerDay;
    if (playerPrice && playerPrice > 0) {
      const e = Math.abs(d.priceElasticity ?? 1.2);
      estimatedDemand = Math.max(0, d.baseUnitsPerDay * Math.pow(refPrice / playerPrice, e));
    }

    return {
      productId:       d.product.id,
      sku:             d.product.sku,
      nameUa:          d.product.nameUa,
      unit:            d.product.unit,
      baseUnitsPerDay: d.baseUnitsPerDay,
      referencePrice:  refPrice,
      inStock:         invMap.get(d.product.id)?.quantity ?? 0,
      avgQuality:      invMap.get(d.product.id)?.avgQuality ?? 0,
      playerPrice,
      isActive:        listing?.isActive ?? false,
      estimatedDemand: +estimatedDemand.toFixed(2),
    };
  });

  return NextResponse.json({ cityName: enterprise.landPlot.city.nameUa, items, capacityKg, usedKg: +usedKg.toFixed(1) });
}

// PATCH — встановити ціну / активувати продаж
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: enterpriseId } = await params;
  const playerId = session.user.id;
  const body = await req.json().catch(() => ({})) as {
    productId?: string; price?: number; isActive?: boolean;
    startPromotion?: boolean; // if true: start a 5-tick promotion (-15% price, ×1.5 NPC share)
  };

  if (!body.productId) return NextResponse.json({ error: "productId required" }, { status: 400 });
  if (body.price !== undefined && body.price <= 0) return NextResponse.json({ error: "Ціна має бути > 0" }, { status: 400 });

  const enterprise = await prisma.enterprise.findFirst({ where: { id: enterpriseId, playerId } });
  if (!enterprise) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Handle promotion launch
  if (body.startPromotion) {
    const PROMO_COST      = 5000;
    const PROMO_DURATION  = 5n;
    const player = await prisma.player.findFirst({ where: { id: playerId }, select: { cashBalance: true } });
    if (!player || Number(player.cashBalance) < PROMO_COST) {
      return NextResponse.json({ error: `Недостатньо коштів. Потрібно ₴${PROMO_COST} рекламного бюджету.` }, { status: 422 });
    }
    const tick = await prisma.gameTick.findFirst({ orderBy: { tickNumber: 'desc' }, select: { tickNumber: true } });
    const endTick = (tick?.tickNumber ?? 0n) + PROMO_DURATION;
    await prisma.$transaction([
      prisma.retailListing.upsert({
        where:  { enterpriseId_productId: { enterpriseId, productId: body.productId } },
        create: { enterpriseId, productId: body.productId, pricePerUnit: 0, isActive: true, promotionActive: true, promotionEndTick: endTick },
        update: { promotionActive: true, promotionEndTick: endTick },
      }),
      prisma.player.update({
        where: { id: playerId },
        data:  { cashBalance: { decrement: PROMO_COST } },
      }),
    ]);
    return NextResponse.json({ ok: true, promoted: true, endTick: Number(endTick) });
  }

  const upd: { pricePerUnit?: number; isActive?: boolean } = {};
  if (body.price    !== undefined) upd.pricePerUnit = body.price;
  if (body.isActive !== undefined) upd.isActive     = body.isActive;

  await prisma.retailListing.upsert({
    where:  { enterpriseId_productId: { enterpriseId, productId: body.productId } },
    create: { enterpriseId, productId: body.productId, pricePerUnit: body.price ?? 0, isActive: body.isActive ?? true },
    update: upd,
  });

  return NextResponse.json({ ok: true });
}
