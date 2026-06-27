import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const COST_PER_M2     = 2500; // ₴ per m²
const TICKS_PER_50M2  = 1;    // 1 tick per 50m² (min 2 ticks)

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: enterpriseId } = await params;
  const playerId = session.user.id;

  const body = await req.json().catch(() => ({})) as {
    recipeId?: string; areaM2?: number; name?: string;
  };

  if (!body.recipeId || !body.areaM2 || body.areaM2 < 50) {
    return NextResponse.json({ error: "recipeId і areaM2 (≥50) обов'язкові" }, { status: 400 });
  }

  const enterprise = await prisma.enterprise.findFirst({
    where: { id: enterpriseId, playerId },
    select: { id: true, name: true, type: true, landPlot: { select: { totalAreaM2: true, usedAreaM2: true } } },
  });
  if (!enterprise) return NextResponse.json({ error: "Підприємство не знайдено" }, { status: 404 });

  const recipe = await prisma.recipe.findFirst({
    where: { id: body.recipeId, enterpriseType: enterprise.type as any },
    select: { id: true, name: true },
  });
  if (!recipe) return NextResponse.json({ error: "Рецепт не знайдено або не підходить для цього типу підприємства" }, { status: 400 });

  const cost = Math.round(body.areaM2 * COST_PER_M2);
  const player = await prisma.player.findUnique({ where: { id: playerId }, select: { cashBalance: true } });
  if (!player || Number(player.cashBalance) < cost) {
    return NextResponse.json({ error: `Недостатньо коштів. Потрібно ₴${cost.toLocaleString("uk-UA")}.` }, { status: 422 });
  }

  const tick = await prisma.gameTick.findFirst({ orderBy: { tickNumber: "desc" }, select: { tickNumber: true } });
  const currentTick    = tick?.tickNumber ?? 0n;
  const buildTicks     = BigInt(Math.max(2, Math.ceil(body.areaM2 / 50) * TICKS_PER_50M2));
  const activatesAtTick = currentTick + buildTicks;
  const workshopName   = body.name ?? `${recipe.name} — розширення`;

  await prisma.$transaction([
    prisma.player.update({
      where: { id: playerId },
      data:  { cashBalance: { decrement: cost } },
    }),
    prisma.workshop.create({
      data: {
        enterpriseId,
        name:           workshopName,
        footprintM2:    body.areaM2,
        maxCapacity:    body.areaM2 * 0.8,
        currentVolume:  0,
        isActive:       false,
        activatesAtTick,
      },
    }),
    prisma.financialLog.create({
      data: {
        playerId,
        category:    "EXPENSE_MAINTENANCE",
        amountUah:   -cost,
        description: `Розширення "${enterprise.name}": ${body.areaM2} м², ${buildTicks} тіків будівництва`,
        tickNumber:  currentTick,
      },
    }),
  ]);

  return NextResponse.json({
    ok:            true,
    cost,
    buildTicks:    Number(buildTicks),
    activatesAtTick: Number(activatesAtTick),
    message:       `Будівництво розпочато. Цех активується через ${buildTicks} тік(ів).`,
  });
}
