/**
 * Wave 1 (FOOD_PROCESSING) — одноразова вставка контенту в прод-БД.
 * Ідемпотентний: продукти/рецепти за SKU/name, NpcDemand upsert.
 * Запуск: node scripts/food-content-oneoff.mjs
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

// ── Нові продукти ────────────────────────────────────────────────────────────
const PRODUCTS = [
  // напівфабрикати (вхідні — ДержПром їх продає)
  { sku: 'SF-DOUGH',   name: 'Dough',       nameUa: 'Тісто',   category: 'SEMI_FINISHED', unit: 'kg',   weight: 1 },
  { sku: 'SF-MINCE',   name: 'Minced Meat', nameUa: 'Фарш',    category: 'SEMI_FINISHED', unit: 'kg',   weight: 1 },
  // готові продукти
  { sku: 'FG-YOGURT',      name: 'Yogurt',      nameUa: 'Йогурт',   category: 'FINISHED_GOOD', unit: 'kg',   weight: 1 },
  { sku: 'FG-SOURCREAM',   name: 'Sour Cream',  nameUa: 'Сметана',  category: 'FINISHED_GOOD', unit: 'kg',   weight: 1 },
  { sku: 'FG-COOKIES',     name: 'Cookies',     nameUa: 'Печиво',   category: 'FINISHED_GOOD', unit: 'kg',   weight: 1 },
  { sku: 'FG-DUMPLINGS',   name: 'Dumplings',   nameUa: 'Пельмені', category: 'FINISHED_GOOD', unit: 'kg',   weight: 1 },
  { sku: 'FG-MAYO',        name: 'Mayonnaise',  nameUa: 'Майонез',  category: 'FINISHED_GOOD', unit: 'kg',   weight: 1 },
  { sku: 'FG-CANNED-MEAT', name: 'Canned Meat', nameUa: 'Тушонка',  category: 'FINISHED_GOOD', unit: 'unit', weight: 0.5 },
];

const EQUIPMENT = [
  { sku: 'EQ-BAKELINE',         name: 'Bakery Line',            nameUa: 'Хлібопекарська лінія',        price: 320000 },
  { sku: 'EQ-MEATLINE',         name: 'Meat Processing Line',   nameUa: 'М’ясопереробна лінія',        price: 420000 },
  { sku: 'EQ-CHEESEVAT',        name: 'Cheese Vat',             nameUa: 'Сироварний чан',              price: 280000 },
  { sku: 'EQ-BOTTLING',         name: 'Bottling Line',          nameUa: 'Лінія розливу',               price: 260000 },
  { sku: 'EQ-REFRIGERATOR-IND', name: 'Industrial Refrigerator',nameUa: 'Промислова холодильна камера',price: 350000 },
];

// ── Рецепти (входи/виходи за SKU) ────────────────────────────────────────────
const RECIPES = [
  { name: 'Dough Kneading',        ticks: 1, labor: 0.05, quality: 7.5, power: 0.09, inputs: [['SF-FLOUR', 0.75]], outputs: [['SF-DOUGH', 1.0]] },
  { name: 'Meat Mincing',          ticks: 1, labor: 0.06, quality: 7.6, power: 0.11, inputs: [['RM-PIGS', 0.012]], outputs: [['SF-MINCE', 1.0]] },
  { name: 'Yogurt Production',     ticks: 1, labor: 0.07, quality: 8.0, power: 0.10, inputs: [['RM-MILK', 1.1], ['SF-SUGAR', 0.08]], outputs: [['FG-YOGURT', 1.0]] },
  { name: 'Sour Cream Production', ticks: 1, labor: 0.06, quality: 8.1, power: 0.09, inputs: [['RM-MILK', 1.6]], outputs: [['FG-SOURCREAM', 1.0]] },
  { name: 'Cookie Baking',         ticks: 2, labor: 0.08, quality: 7.9, power: 0.16, inputs: [['SF-FLOUR', 0.6], ['SF-SUGAR', 0.3], ['FG-BUTTER', 0.12]], outputs: [['FG-COOKIES', 1.0]] },
  { name: 'Dumpling Making',       ticks: 2, labor: 0.10, quality: 7.8, power: 0.14, inputs: [['SF-DOUGH', 0.55], ['SF-MINCE', 0.45]], outputs: [['FG-DUMPLINGS', 1.0]] },
  { name: 'Mayonnaise Production', ticks: 1, labor: 0.06, quality: 7.7, power: 0.10, inputs: [['FG-SUNOIL', 0.65], ['FG-EGGS', 0.05]], outputs: [['FG-MAYO', 1.0]] },
  { name: 'Meat Canning',          ticks: 2, labor: 0.09, quality: 8.0, power: 0.20, inputs: [['FG-MEAT', 0.55]], outputs: [['FG-CANNED-MEAT', 1.0]] },
];

// Готові продукти — попит NpcDemand у всіх містах (масштаб pop×demandCoeff, як у seed.ts)
const FG_DEMAND = {
  'FG-YOGURT':      { baseUnits: 180, priceUah:  65, elasticity: -1.0, qualityWeight: 0.55 },
  'FG-SOURCREAM':   { baseUnits: 120, priceUah:  75, elasticity: -1.0, qualityWeight: 0.55 },
  'FG-COOKIES':     { baseUnits:  90, priceUah: 130, elasticity: -1.2, qualityWeight: 0.65 },
  'FG-DUMPLINGS':   { baseUnits: 110, priceUah: 160, elasticity: -1.1, qualityWeight: 0.65 },
  'FG-MAYO':        { baseUnits: 100, priceUah:  95, elasticity: -1.0, qualityWeight: 0.50 },
  'FG-CANNED-MEAT': { baseUnits:  80, priceUah: 120, elasticity: -1.0, qualityWeight: 0.60 },
};

// Вхідні н/ф — довідкова ціна для ДержПром SELL
const INPUT_PRICE = { 'SF-DOUGH': 14.0, 'SF-MINCE': 150.0 };

async function upsertProduct(p) {
  let product = await prisma.product.findFirst({ where: { sku: p.sku } });
  if (!product) {
    product = await prisma.product.create({
      data: {
        sku: p.sku, name: p.name, nameUa: p.nameUa, category: p.category,
        unit: p.unit, baseWeightKg: p.weight ?? 1, isEquipmentItem: p.category === 'EQUIPMENT_ITEM',
      },
    });
    console.log(`  ✓ Продукт: ${p.sku} — ${p.nameUa}`);
  }
  return product;
}

async function main() {
  console.log('\n=== Wave 1: FOOD_PROCESSING контент ===\n');
  const cities = await prisma.city.findMany({ select: { id: true, population: true, demandCoefficient: true, wageCoefficient: true } });

  // 1) Продукти
  const bySku = {};
  for (const p of PRODUCTS) bySku[p.sku] = await upsertProduct(p);
  for (const e of EQUIPMENT) bySku[e.sku] = await upsertProduct({ ...e, category: 'EQUIPMENT_ITEM', unit: 'unit', weight: 1 });

  // 2) Рецепти (ідемпотентні за name)
  let recipeCount = 0;
  for (const r of RECIPES) {
    if (await prisma.recipe.findFirst({ where: { name: r.name } })) { continue; }
    const recipe = await prisma.recipe.create({
      data: { name: r.name, enterpriseType: 'FOOD_PROCESSING', ticksToComplete: r.ticks,
              laborHoursPerUnit: r.labor, baseQuality: r.quality, powerKwhPerUnit: r.power },
    });
    for (const [sku, qty] of r.inputs) {
      const prod = await prisma.product.findFirst({ where: { sku } });
      if (!prod) { console.warn(`  ! вхід ${sku} для ${r.name} не знайдено`); continue; }
      await prisma.recipeInput.create({ data: { recipeId: recipe.id, productId: prod.id, quantityPerUnit: qty } });
    }
    for (const [sku, qty] of r.outputs) {
      const prod = await prisma.product.findFirst({ where: { sku } });
      await prisma.recipeOutput.create({ data: { recipeId: recipe.id, productId: prod.id, quantityPerUnit: qty } });
    }
    recipeCount++;
    console.log(`  ✓ Рецепт: ${r.name}`);
  }

  // 3) NpcDemand для нових FG у всіх містах
  let demandCount = 0;
  for (const city of cities) {
    for (const [sku, spec] of Object.entries(FG_DEMAND)) {
      const productId = bySku[sku]?.id;
      if (!productId) continue;
      const scaledUnits = spec.baseUnits * (city.population / 1_000_000) * city.demandCoefficient;
      await prisma.npcDemand.upsert({
        where:  { cityId_productId: { cityId: city.id, productId } },
        update: {},
        create: {
          cityId: city.id, productId, baseUnitsPerDay: scaledUnits,
          referencePrice: spec.priceUah * city.wageCoefficient,
          priceElasticity: spec.elasticity, qualityWeight: spec.qualityWeight,
        },
      });
      demandCount++;
    }
  }

  const derzhprom = await prisma.player.findFirst({ where: { username: 'derzhprom' } });
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  // 4) Вхідні н/ф — довідкова ціна (перше місто) + ДержПром SELL
  for (const [sku, price] of Object.entries(INPUT_PRICE)) {
    const product = bySku[sku];
    if (!product) continue;
    const existing = await prisma.npcDemand.findFirst({ where: { productId: product.id } });
    if (!existing) {
      await prisma.npcDemand.create({ data: { productId: product.id, cityId: cities[0].id, baseUnitsPerDay: 0.1, referencePrice: price } });
    }
    if (derzhprom) {
      await prisma.marketOrder.updateMany({
        where: { playerId: derzhprom.id, productId: product.id, status: { in: ['OPEN', 'PARTIALLY_FILLED'] } },
        data:  { status: 'CANCELLED' },
      });
      const qty = 5000;
      await prisma.playerInventory.upsert({
        where:  { playerId_productId: { playerId: derzhprom.id, productId: product.id } },
        update: { quantity: { increment: qty } },
        create: { playerId: derzhprom.id, productId: product.id, quantity: qty, avgQuality: 6.0 },
      });
      await prisma.marketOrder.create({
        data: { playerId: derzhprom.id, productId: product.id, resourceType: sku, type: 'SELL', status: 'OPEN',
                pricePerUnit: +(price * 1.05).toFixed(2), quality: 6.0, quantityTotal: qty, quantityFilled: 0, expiresAt },
      });
    }
  }

  // 5) Техніка — довідкова ціна + ДержПром SELL (3 тіри якості)
  let eqOrders = 0;
  for (const e of EQUIPMENT) {
    const product = bySku[e.sku];
    if (!product) continue;
    const existing = await prisma.npcDemand.findFirst({ where: { productId: product.id } });
    if (!existing) {
      await prisma.npcDemand.create({ data: { productId: product.id, cityId: cities[0].id, baseUnitsPerDay: 0.1, referencePrice: e.price } });
    }
    if (derzhprom) {
      await prisma.marketOrder.updateMany({
        where: { playerId: derzhprom.id, productId: product.id, status: { in: ['OPEN', 'PARTIALLY_FILLED'] } },
        data:  { status: 'CANCELLED' },
      });
      for (const tier of [{ q: 6.0, p: Math.round(e.price * 0.8) }, { q: 7.5, p: e.price }, { q: 9.0, p: Math.round(e.price * 1.25) }]) {
        const qty = 10;
        await prisma.playerInventory.upsert({
          where:  { playerId_productId: { playerId: derzhprom.id, productId: product.id } },
          update: { quantity: { increment: qty } },
          create: { playerId: derzhprom.id, productId: product.id, quantity: qty, avgQuality: tier.q },
        });
        await prisma.marketOrder.create({
          data: { playerId: derzhprom.id, productId: product.id, resourceType: e.sku, type: 'SELL', status: 'OPEN',
                  pricePerUnit: tier.p, quality: tier.q, quantityTotal: qty, quantityFilled: 0, expiresAt },
        });
        eqOrders++;
      }
    }
  }

  console.log(`\n  рецептів створено: ${recipeCount}`);
  console.log(`  NpcDemand-рядків (FG): ${demandCount}`);
  console.log(`  ДержПром ордерів техніки: ${eqOrders}`);
  console.log('\n✅ Готово!\n');
}

main().catch(console.error).finally(() => prisma.$disconnect());
