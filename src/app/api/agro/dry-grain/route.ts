import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const TARGET_MOISTURE = 14.0;   // % — стандарт зберігання
const DRYING_COST_PER_PCT = 35; // ₴ за кожен 1% зниження вологи на 1 тонну

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const playerId = session.user.id;

  const { workshopId } = await req.json().catch(() => ({})) as { workshopId?: string };
  if (!workshopId) return NextResponse.json({ error: "workshopId required" }, { status: 400 });

  const workshop = await prisma.workshop.findFirst({
    where: { id: workshopId, enterprise: { playerId, type: 'AGRO_FARM', isOperational: true } },
    select: {
      id: true, grainMoisturePct: true, harvestAccumulated: true,
      enterprise: {
        select: {
          id: true, playerId: true,
          landPlot: { select: { id: true, grainQualityClass: true, nitrogenLevel: true, phosphorusLevel: true, potassiumLevel: true, moistureLevel: true, soilQuality: true } },
        },
      },
    },
  });

  if (!workshop) return NextResponse.json({ error: "Цех не знайдено" }, { status: 404 });

  const currentMoisture = workshop.grainMoisturePct ?? 14.0;
  if (currentMoisture <= TARGET_MOISTURE) {
    return NextResponse.json({
      ok: false,
      message: `Зерно вже сухе (${currentMoisture.toFixed(1)}% ≤ ${TARGET_MOISTURE}%). Сушіння не потрібне.`,
      grainMoisturePct: currentMoisture,
    }, { status: 400 });
  }

  const harvestedTonnes = (workshop.harvestAccumulated ?? 0) / 1000;
  if (harvestedTonnes < 0.001) {
    return NextResponse.json({ error: "Немає зерна для сушіння" }, { status: 400 });
  }

  const pctDrop = currentMoisture - TARGET_MOISTURE;
  const cost    = Math.ceil(pctDrop * harvestedTonnes * DRYING_COST_PER_PCT);

  const player = await prisma.player.findUnique({ where: { id: playerId }, select: { cashBalance: true } });
  if (!player || Number(player.cashBalance) < cost) {
    return NextResponse.json({
      error: `Недостатньо коштів. Потрібно ₴${cost.toLocaleString('uk-UA')} для сушіння ${harvestedTonnes.toFixed(2)} т з ${currentMoisture.toFixed(1)}% до ${TARGET_MOISTURE}%`,
      cost,
    }, { status: 400 });
  }

  const before = Number(player.cashBalance);

  // Після сушіння перераховуємо клас зерна
  const lp = workshop.enterprise.landPlot;
  const avgNPK = ((lp?.nitrogenLevel ?? 70) + (lp?.phosphorusLevel ?? 70) + (lp?.potassiumLevel ?? 70)) / 3;
  const soil   = lp?.soilQuality ?? 5;
  const newGrainClass =
    (soil >= 8 && avgNPK >= 65 && TARGET_MOISTURE <= 14) ? 1 :
    (soil >= 4 && avgNPK >= 40) ? 2 : 3;

  await prisma.$transaction([
    prisma.player.update({
      where: { id: playerId },
      data:  { cashBalance: { decrement: cost } },
    }),
    prisma.workshop.update({
      where: { id: workshopId },
      data:  { grainMoisturePct: TARGET_MOISTURE },
    }),
    prisma.landPlot.update({
      where: { id: workshop.enterprise.landPlot!.id },
      data:  { grainQualityClass: newGrainClass },
    }),
    prisma.financialTransaction.create({
      data: {
        playerId, type: 'MAINTENANCE_COST',
        amountUah: -cost, balanceBefore: before, balanceAfter: before - cost,
        description: `Сушіння зерна: ${pctDrop.toFixed(1)}% × ${harvestedTonnes.toFixed(2)} т → ${TARGET_MOISTURE}% вологи`,
      },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    moistureBefore:  currentMoisture,
    moistureAfter:   TARGET_MOISTURE,
    pctDrop:         pctDrop.toFixed(1),
    tonnesDried:     harvestedTonnes.toFixed(2),
    cost,
    grainQualityClass: newGrainClass,
    message: `Зерно просушено з ${currentMoisture.toFixed(1)}% до ${TARGET_MOISTURE}%. Клас: ${newGrainClass}. Витрачено ₴${cost.toLocaleString('uk-UA')}.`,
  });
}
