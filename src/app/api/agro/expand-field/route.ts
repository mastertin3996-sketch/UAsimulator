/**
 * POST /api/agro/expand-field
 * Орендує додаткову площу поля для AGRO_FARM.
 * Body: { enterpriseId, extraAreaM2 }
 * Вартість: extraAreaM2 × 8 ₴/м²/місяць оренди + 100 ₴/м² одноразово за підготовку.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AgroService } from "@/engine/AgroService";
import { Decimal } from "@prisma/client/runtime/library";

const SETUP_COST_PER_M2 = 100; // одноразово ₴/м²
const MAX_EXTRA_AREA    = 5000; // максимальне розширення

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { enterpriseId, extraAreaM2 } = body as { enterpriseId: string; extraAreaM2: number };
  if (!enterpriseId || !extraAreaM2 || extraAreaM2 <= 0)
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const ent = await prisma.enterprise.findFirst({
    where: { id: enterpriseId, playerId: session.user.id, type: "AGRO_FARM" },
    select: { id: true, name: true, extraFieldAreaM2: true, extraFieldRentUah: true },
  });
  if (!ent) return NextResponse.json({ error: "AGRO_FARM не знайдено" }, { status: 404 });

  const newTotal = ent.extraFieldAreaM2 + extraAreaM2;
  if (newTotal > MAX_EXTRA_AREA)
    return NextResponse.json({ error: `Максимум ${MAX_EXTRA_AREA} м² додаткового поля` }, { status: 400 });

  const setupCost    = Math.round(extraAreaM2 * SETUP_COST_PER_M2);
  const newMonthlyRent = AgroService.calcExtraFieldRent(newTotal);

  const player = await prisma.player.findUnique({ where: { id: session.user.id }, select: { cashBalance: true } });
  if (Number(player?.cashBalance ?? 0) < setupCost)
    return NextResponse.json({ error: `Недостатньо коштів. Потрібно ₴${setupCost.toLocaleString()}` }, { status: 400 });

  const balanceBefore = new Decimal(player!.cashBalance.toString());
  const balanceAfter  = balanceBefore.minus(setupCost);

  await prisma.$transaction([
    prisma.enterprise.update({
      where: { id: enterpriseId },
      data:  { extraFieldAreaM2: newTotal, extraFieldRentUah: new Decimal(newMonthlyRent) },
    }),
    prisma.player.update({
      where: { id: session.user.id },
      data:  { cashBalance: { decrement: setupCost } },
    }),
    prisma.financialTransaction.create({
      data: {
        playerId:    session.user.id,
        type:        "LAND_LEASE_PAYMENT",
        amountUah:   new Decimal(-setupCost),
        balanceBefore,
        balanceAfter,
        description: `Підготовка поля: ${ent.name} +${extraAreaM2} м²`,
      },
    }),
  ]);

  return NextResponse.json({
    message:      `Поле розширено на ${extraAreaM2} м². Всього: ${newTotal} м².`,
    totalAreaM2:  newTotal,
    monthlyRent:  newMonthlyRent,
    setupCost,
  }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const enterpriseId = searchParams.get("enterpriseId");
  if (!enterpriseId) return NextResponse.json({ error: "enterpriseId required" }, { status: 400 });

  const ent = await prisma.enterprise.findFirst({
    where:  { id: enterpriseId, playerId: session.user.id, type: "AGRO_FARM" },
    select: {
      extraFieldAreaM2: true, extraFieldRentUah: true,
      landPlot: { select: { totalAreaM2: true, soilQuality: true } },
    },
  });
  if (!ent) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    baseLandAreaM2:   ent.landPlot?.totalAreaM2 ?? 0,
    extraFieldAreaM2: ent.extraFieldAreaM2,
    totalFieldAreaM2: (ent.landPlot?.totalAreaM2 ?? 0) + ent.extraFieldAreaM2,
    monthlyRentUah:   Number(ent.extraFieldRentUah),
    soilQuality:      ent.landPlot?.soilQuality ?? 0,
    setupCostPerM2:   SETUP_COST_PER_M2,
    rentPerM2PerMonth: 8,
  });
}
