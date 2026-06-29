import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const COST_PER_M2 = 1; // ₴1/м² — оплата праці підрядника

// Паливний сурчардж ₴/м² (дизель для техніки)
const FUEL_SURCHARGE_PER_M2: Record<string, number> = {
  PLOW:      0.50,
  CULTIVATE: 0.30,
  SOW:       0.20,
  FERTILIZE: 0.20,
  HARVEST:   0.40,
};

const FIELD_OPS = {
  PLOW:      { bit: 1,  label: 'Оранка'          },
  CULTIVATE: { bit: 2,  label: 'Культивація'     },
  SOW:       { bit: 4,  label: 'Посів'           },
  FERTILIZE: { bit: 8,  label: 'Внесення добрив' },
  HARVEST:   { bit: 16, label: 'Збір врожаю'     },
} as const;

type FieldOpKey = keyof typeof FIELD_OPS;

// POST /api/agro/field-ops  { workshopId, op }
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const playerId = session.user.id;

  const { workshopId, op } = await req.json().catch(() => ({})) as { workshopId?: string; op?: string };
  if (!workshopId || !op) return NextResponse.json({ error: "workshopId і op required" }, { status: 400 });
  if (!Object.keys(FIELD_OPS).includes(op)) return NextResponse.json({ error: "Недійсна операція" }, { status: 400 });

  const opDef = FIELD_OPS[op as FieldOpKey];

  const workshop = await prisma.workshop.findFirst({
    where: { id: workshopId, enterprise: { playerId, type: 'AGRO_FARM', isOperational: true } },
    select: {
      id: true, footprintM2: true, harvestAccumulated: true,
      enterprise: {
        select: {
          id: true, playerId: true,
          landPlot: {
            select: {
              id: true, fieldOpsMask: true, fertilizerTicksLeft: true,
              nitrogenLevel: true, phosphorusLevel: true, potassiumLevel: true,
            },
          },
        },
      },
      productionOrders: {
        where:  { status: 'IN_PROGRESS' },
        select: { recipe: { select: { outputs: { select: { product: { select: { id: true, sku: true } } } } } } },
      },
    },
  });
  if (!workshop?.enterprise?.landPlot) return NextResponse.json({ error: "Цех/ферму не знайдено" }, { status: 404 });

  const lp    = workshop.enterprise.landPlot;
  const bit   = opDef.bit;
  if ((lp.fieldOpsMask & bit) !== 0) {
    return NextResponse.json({ error: `«${opDef.label}» вже виконано цього сезону` }, { status: 400 });
  }

  const area        = workshop.footprintM2;
  const laborCost   = Math.ceil(COST_PER_M2 * area);
  const fuelCost    = Math.ceil((FUEL_SURCHARGE_PER_M2[op] ?? 0) * area);
  const cost        = laborCost + fuelCost;

  const player = await prisma.player.findUnique({ where: { id: playerId }, select: { cashBalance: true } });
  if (!player || Number(player.cashBalance) < cost) {
    return NextResponse.json({ error: `Недостатньо коштів. Потрібно ₴${cost.toLocaleString('uk-UA')}` }, { status: 400 });
  }

  const before  = Number(player.cashBalance);
  const newMask = lp.fieldOpsMask | bit;

  // Визначаємо нові значення landPlot
  const clampNPK = (v: number) => Math.min(100, Math.max(0, v));
  const lpData: Record<string, unknown> = { fieldOpsMask: newMask };

  if (op === 'FERTILIZE') {
    // Підрядник вносить добриво — активуємо fertBonус і відновлюємо NPK (концентрат)
    if (lp.fertilizerTicksLeft === 0) lpData.fertilizerTicksLeft = 90;
    lpData.nitrogenLevel   = clampNPK((lp.nitrogenLevel   ?? 70) + 15);
    lpData.phosphorusLevel = clampNPK((lp.phosphorusLevel ?? 70) + 6);
    lpData.potassiumLevel  = clampNPK((lp.potassiumLevel  ?? 70) + 4);
  }

  // Збір підрядником: переносимо harvestAccumulated у інвентар
  const FIELD_CROP_SKUS = new Set(['RM-WHEAT', 'RM-SUNFL', 'RM-SUGBEET', 'RM-CORN']);
  const doHarvest = op === 'HARVEST' && workshop.harvestAccumulated >= 0.1;
  let harvestedQty = 0;
  let harvestProductId: string | null = null;

  if (doHarvest) {
    const outputSku = workshop.productionOrders[0]?.recipe?.outputs?.find(o => FIELD_CROP_SKUS.has(o.product.sku))?.product.sku;
    if (outputSku) {
      const prod = await prisma.product.findUnique({ where: { sku: outputSku }, select: { id: true } });
      harvestProductId = prod?.id ?? null;
      harvestedQty = workshop.harvestAccumulated;
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.player.update({ where: { id: playerId }, data: { cashBalance: { decrement: cost } } });
    await tx.landPlot.update({ where: { id: lp.id }, data: lpData });
    await tx.financialTransaction.create({ data: {
      playerId, type: 'MAINTENANCE_COST',
      amountUah: -cost, balanceBefore: before, balanceAfter: before - cost,
      description: `Польова робота: ${opDef.label} (праця ₴${laborCost} + пальне ₴${fuelCost})`,
    } });

    if (doHarvest && harvestProductId) {
      await tx.workshop.update({ where: { id: workshopId }, data: { harvestAccumulated: 0 } });
      await tx.enterpriseInventory.upsert({
        where:  { enterpriseId_productId: { enterpriseId: workshop.enterprise.id, productId: harvestProductId } },
        update: { quantity: { increment: harvestedQty } },
        create: { enterpriseId: workshop.enterprise.id, productId: harvestProductId, quantity: harvestedQty },
      });
    }
  });

  const extra = doHarvest && harvestedQty > 0
    ? ` Зібрано ${harvestedQty.toFixed(1)} кг.`
    : op === 'FERTILIZE' ? ' Добриво активоване (+NPK).' : '';

  return NextResponse.json({
    ok: true, op, label: opDef.label, cost, laborCost, fuelCost, newMask,
    message: `${opDef.label} виконано підрядником. Праця ₴${laborCost.toLocaleString('uk-UA')} + пальне ₴${fuelCost.toLocaleString('uk-UA')}.${extra}`,
  });
}
