import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LivestockSpecies, Profession } from "@prisma/client";

// ── Вікові обмеження (тіків) ────────────────────────────────────────────────
const MIN_AGE: Record<LivestockSpecies, number> = {
  POULTRY: 90,
  PIGS:    195,
  CATTLE:  500,
};

// ── Обладнання, що вимагається ───────────────────────────────────────────────
const REQUIRED_EQUIPMENT: Record<LivestockSpecies, string> = {
  POULTRY: "EQ-SLAUGHTER_POULTRY",
  PIGS:    "EQ-SLAUGHTER_PIGS",
  CATTLE:  "EQ-SLAUGHTER_CATTLE",
};

// ── Ліміт забою за тік ───────────────────────────────────────────────────────
const DAILY_LIMIT: Record<LivestockSpecies, number> = {
  POULTRY: 200,
  PIGS:    6,
  CATTLE:  15,
};

// ── Вихідні продукти після забою ─────────────────────────────────────────────
const SLAUGHTER_BYPRODUCTS: Record<LivestockSpecies, { sku: string; kgPerHead: number }[]> = {
  POULTRY: [
    { sku: "FG-CHICKEN-MEAT", kgPerHead: 2.0 },
    { sku: "FG-BONES",        kgPerHead: 0.5 },
  ],
  PIGS: [
    { sku: "FG-PORK-MEAT", kgPerHead: 60 },
    { sku: "FG-LARD",      kgPerHead: 25 },
    { sku: "FG-BONES",     kgPerHead: 10 },
    { sku: "FG-BLOOD",     kgPerHead: 12 },
  ],
  CATTLE: [
    { sku: "FG-BEEF-MEAT", kgPerHead: 250 },
    { sku: "FG-OFFAL",     kgPerHead: 20  },
    { sku: "FG-BONES",     kgPerHead: 50  },
    { sku: "FG-BLOOD",     kgPerHead: 16  },
  ],
};

// ── Обов'язковий персонал ────────────────────────────────────────────────────
const REQUIRED_STAFF: Record<LivestockSpecies, Profession[]> = {
  POULTRY: [Profession.DEBONER, Profession.SLAUGHTER_TECH],
  PIGS:    [Profession.DEBONER, Profession.SLAUGHTER_TECH],
  CATTLE:  [Profession.DEBONER, Profession.SLAUGHTER_TECH, Profession.TECHNICIAN],
};

// POST /api/agro/slaughter
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const playerId = session.user.id;

  const body = await req.json().catch(() => ({})) as {
    enterpriseId?: string;
    herdId?: string;
    count?: number;
  };

  const { enterpriseId, herdId, count } = body;
  if (!enterpriseId || !herdId || !count || count < 1) {
    return NextResponse.json(
      { error: "enterpriseId, herdId та count (>0) обов'язкові" },
      { status: 400 },
    );
  }

  // ── 1. Знайти стадо (підтвердити власника через enterprise) ─────────────────
  const herd = await prisma.livestockHerd.findFirst({
    where: {
      id:     herdId,
      enterprise: { playerId },
    },
  });
  if (!herd) return NextResponse.json({ error: "Стадо не знайдено" }, { status: 404 });

  // ── 2. Перевірити count ≤ headCount ─────────────────────────────────────────
  if (count > herd.headCount) {
    return NextResponse.json(
      { error: `Запитано ${count}, але у стаді лише ${herd.headCount} голів` },
      { status: 400 },
    );
  }

  const species = herd.species;

  // ── 3. Перевірити вік ────────────────────────────────────────────────────────
  if (herd.ageInTicks < MIN_AGE[species]) {
    return NextResponse.json(
      { error: `Вік стада (${herd.ageInTicks} тіків) менший за мінімальний для забою (${MIN_AGE[species]} тіків)` },
      { status: 400 },
    );
  }

  // ── 4. Перевірити обладнання ─────────────────────────────────────────────────
  const wsWithEquip = await prisma.workshop.findFirst({
    where: {
      enterpriseId,
      equipment: {
        some: {
          isBroken: false,
          wearAndTear: { lt: 1.0 },
          catalogProduct: { sku: REQUIRED_EQUIPMENT[species] },
        },
      },
    },
  });
  if (!wsWithEquip) {
    return NextResponse.json(
      { error: `Потрібне обладнання ${REQUIRED_EQUIPMENT[species]} відсутнє або зламане` },
      { status: 400 },
    );
  }

  // ── 5. Перевірити персонал ────────────────────────────────────────────────────
  const enterprise = await prisma.enterprise.findFirst({
    where: { id: enterpriseId, playerId },
    select: {
      id: true,
      employees: { select: { profession: true } },
    },
  });
  if (!enterprise) return NextResponse.json({ error: "Підприємство не знайдено" }, { status: 404 });

  const employedProfessions = new Set(enterprise.employees.map(e => e.profession));
  const requiredStaff = REQUIRED_STAFF[species];
  const missingStaff = requiredStaff.filter(p => !employedProfessions.has(p));
  if (missingStaff.length > 0) {
    return NextResponse.json(
      { error: `Бракує персоналу: ${missingStaff.join(", ")}` },
      { status: 400 },
    );
  }

  // ── 6. Застосувати ліміт ─────────────────────────────────────────────────────
  const actualCount = Math.min(count, DAILY_LIMIT[species]);

  // ── 7. Завантажити продукти одним запитом ────────────────────────────────────
  const byproductDefs = SLAUGHTER_BYPRODUCTS[species];
  const skus = byproductDefs.map(b => b.sku);
  const products = await prisma.product.findMany({
    where: { sku: { in: skus } },
    select: { id: true, sku: true, nameUa: true },
  });
  const productBySku = new Map(products.map(p => [p.sku, p]));

  // ── 8. Транзакція ────────────────────────────────────────────────────────────
  const newHeadCount = herd.headCount - actualCount;

  const inventoryOps = byproductDefs.map(bp => {
    const product = productBySku.get(bp.sku);
    if (!product) return null;
    const qty = bp.kgPerHead * actualCount;
    return prisma.enterpriseInventory.upsert({
      where:  { enterpriseId_productId: { enterpriseId, productId: product.id } },
      update: { quantity: { increment: qty } },
      create: { enterpriseId, productId: product.id, quantity: qty, avgQuality: 7 },
    });
  }).filter(Boolean);

  const herdOp = newHeadCount <= 0
    ? prisma.livestockHerd.delete({ where: { id: herd.id } })
    : prisma.livestockHerd.update({ where: { id: herd.id }, data: { headCount: newHeadCount } });

  const speciesLabels: Record<LivestockSpecies, string> = {
    POULTRY: "птиця",
    PIGS:    "свині",
    CATTLE:  "ВРХ",
  };

  const txDescription = `Забій: ${speciesLabels[species]} ×${actualCount} голів (підприємство ${enterpriseId})`;

  // отримати поточний тік для фін.транзакції
  const tick = await prisma.gameTick.findFirst({
    orderBy: { tickNumber: "desc" },
    select:  { tickNumber: true },
  });

  await prisma.$transaction([
    herdOp,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(inventoryOps as any[]),
    prisma.financialLog.create({
      data: {
        playerId,
        category:    "REVENUE_B2B",
        amountUah:   0,
        description: txDescription,
        referenceId: enterpriseId,
        tickNumber:  tick?.tickNumber ?? 0n,
      },
    }),
  ]);

  // ── 9. Сформувати відповідь ──────────────────────────────────────────────────
  const byproductResponse = byproductDefs
    .map(bp => {
      const product = productBySku.get(bp.sku);
      if (!product) return null;
      return {
        sku:    bp.sku,
        nameUa: product.nameUa,
        qty:    bp.kgPerHead * actualCount,
      };
    })
    .filter(Boolean);

  return NextResponse.json({
    ok:          true,
    slaughtered: actualCount,
    byproducts:  byproductResponse,
    message:     `Забито ${actualCount} голів. Продукти на складі.`,
  });
}
