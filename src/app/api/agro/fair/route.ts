/**
 * POST /api/agro/fair
 * Продаж зерна на агро-ярмарку за referencePrice × 1.15.
 * Доступно лише коли currentTick % 20 === 0.
 * Body: { enterpriseId, sku, quantity }
 *
 * GET /api/agro/fair?enterpriseId=...
 * Повертає поточний статус ярмарку та запаси зерна для продажу.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AgroService } from "@/engine/AgroService";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const enterpriseId = searchParams.get("enterpriseId");
  if (!enterpriseId) return NextResponse.json({ error: "enterpriseId required" }, { status: 400 });

  const ent = await prisma.enterprise.findFirst({
    where:  { id: enterpriseId, playerId: session.user.id, type: "AGRO_FARM" },
    select: {
      inventory: {
        where: { quantity: { gt: 0 } },
        select: {
          quantity: true, avgQuality: true,
          product: { select: { id: true, sku: true, nameUa: true, unit: true } },
        },
      },
    },
  });
  if (!ent) return NextResponse.json({ error: "AGRO_FARM не знайдено" }, { status: 404 });

  const currentTick = await prisma.gameTick.findFirst({
    orderBy: { tickNumber: "desc" },
    select: { tickNumber: true },
  });
  const tick = Number(currentTick?.tickNumber ?? 0);
  const isFairDay = tick % 20 === 0;
  const nextFairIn = isFairDay ? 0 : 20 - (tick % 20);

  // Grain inventory with fair price
  const FAIR_SKUS = AgroService.FAIR_GRAIN_SKUS;
  const grainStock = await Promise.all(
    ent.inventory
      .filter(i => FAIR_SKUS.has(i.product.sku))
      .map(async (i) => {
        const demand = await prisma.npcDemand.aggregate({
          where: { productId: i.product.id },
          _avg:  { referencePrice: true },
        });
        const refPrice  = Number(demand._avg.referencePrice ?? 0);
        const fairPrice = Math.round(refPrice * AgroService.FAIR_PREMIUM);
        return {
          sku:       i.product.sku,
          nameUa:    i.product.nameUa,
          unit:      i.product.unit,
          quantity:  Number(i.quantity),
          quality:   i.avgQuality,
          refPrice,
          fairPrice,
        };
      })
  );

  return NextResponse.json({
    isFairDay,
    nextFairIn,
    currentTick: tick,
    fairPremium: AgroService.FAIR_PREMIUM,
    grainStock,
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { enterpriseId, sku, quantity } = body as {
    enterpriseId: string; sku: string; quantity: number;
  };
  if (!enterpriseId || !sku || !quantity || quantity <= 0) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const ent = await prisma.enterprise.findFirst({
    where: { id: enterpriseId, playerId: session.user.id, type: "AGRO_FARM" },
    select: { id: true },
  });
  if (!ent) return NextResponse.json({ error: "AGRO_FARM не знайдено" }, { status: 404 });

  const currentTick = await prisma.gameTick.findFirst({
    orderBy: { tickNumber: "desc" },
    select: { tickNumber: true },
  });
  const tick = Number(currentTick?.tickNumber ?? 0);
  if (tick % 20 !== 0) {
    return NextResponse.json({
      error: `Ярмарок ще не відкрито. До наступного: ${20 - (tick % 20)} днів.`,
    }, { status: 400 });
  }

  try {
    const agro = new AgroService(prisma);
    const result = await agro.sellAtAgroFair(enterpriseId, session.user.id, sku, quantity);
    return NextResponse.json({
      message:    `Продано ${result.soldUnits.toFixed(1)} од. на ярмарку. Виручка: ₴${result.revenueUah.toLocaleString()}`,
      soldUnits:  result.soldUnits,
      revenueUah: result.revenueUah,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Помилка";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
