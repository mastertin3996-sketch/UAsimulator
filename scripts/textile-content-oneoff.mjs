/**
 * Wave 2 (TEXTILE_FACTORY) — одноразова вставка контенту в прод-БД.
 * Ідемпотентний. Запуск: node scripts/textile-content-oneoff.mjs
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

const PRODUCTS = [
  { sku: 'RM-FLAX',    name: 'Raw Flax',      nameUa: 'Льон-сирець',       category: 'RAW_MATERIAL',  unit: 'kg',   weight: 1 },
  { sku: 'SF-LINEN',   name: 'Linen Fabric',  nameUa: 'Лляна тканина',     category: 'SEMI_FINISHED', unit: 'kg',   weight: 1 },
  { sku: 'SF-DENIM',   name: 'Denim Fabric',  nameUa: 'Джинсова тканина',  category: 'SEMI_FINISHED', unit: 'kg',   weight: 1 },
  { sku: 'SF-THREAD',  name: 'Sewing Thread', nameUa: 'Нитки швейні',      category: 'SEMI_FINISHED', unit: 'kg',   weight: 1 },
  { sku: 'FG-BEDDING', name: 'Bedding Set',   nameUa: 'Постільна білизна', category: 'FINISHED_GOOD', unit: 'unit', weight: 1.5 },
  { sku: 'FG-JEANS',   name: 'Jeans',         nameUa: 'Джинси',            category: 'FINISHED_GOOD', unit: 'unit', weight: 0.7 },
  { sku: 'FG-CARPET',  name: 'Carpet',        nameUa: 'Килим',             category: 'FINISHED_GOOD', unit: 'unit', weight: 8 },
  { sku: 'FG-WORKWEAR',name: 'Workwear',      nameUa: 'Спецодяг',          category: 'FINISHED_GOOD', unit: 'unit', weight: 1.0 },
];

const EQUIPMENT = [
  { sku: 'EQ-SPINNINGMILL', name: 'Spinning Mill',    nameUa: 'Прядильна машина', price: 380000 },
  { sku: 'EQ-LOOM',         name: 'Weaving Loom',     nameUa: 'Ткацький верстат', price: 300000 },
  { sku: 'EQ-KNITMACHINE',  name: 'Knitting Machine', nameUa: 'В’язальна машина', price: 260000 },
  { sku: 'EQ-SEWINGLINE',   name: 'Sewing Line',      nameUa: 'Швейна лінія',     price: 220000 },
  { sku: 'EQ-DYEINGVAT',    name: 'Dyeing Vat',       nameUa: 'Фарбувальний чан', price: 240000 },
];

const RECIPES = [
  { name: 'Flax Spinning',          ticks: 1, labor: 0.13, quality: 7.6, power: 0.26, inputs: [['RM-FLAX', 1.35]], outputs: [['SF-LINEN', 1.0]] },
  { name: 'Denim Weaving',          ticks: 1, labor: 0.14, quality: 7.7, power: 0.30, inputs: [['RM-COTTON', 1.45]], outputs: [['SF-DENIM', 1.0]] },
  { name: 'Thread Spinning',        ticks: 1, labor: 0.09, quality: 7.8, power: 0.18, inputs: [['RM-COTTON', 1.10]], outputs: [['SF-THREAD', 1.0]] },
  { name: 'Bedding Manufacturing',  ticks: 2, labor: 0.80, quality: 7.9, power: 0.16, inputs: [['SF-LINEN', 2.20], ['SF-THREAD', 0.10]], outputs: [['FG-BEDDING', 1.0]] },
  { name: 'Jeans Manufacturing',    ticks: 2, labor: 0.95, quality: 7.8, power: 0.19, inputs: [['SF-DENIM', 1.30], ['SF-THREAD', 0.06]], outputs: [['FG-JEANS', 1.0]] },
  { name: 'Carpet Weaving',         ticks: 3, labor: 1.30, quality: 8.0, power: 0.35, inputs: [['SF-YARN', 4.50]], outputs: [['FG-CARPET', 1.0]] },
  { name: 'Workwear Manufacturing', ticks: 2, labor: 0.85, quality: 7.7, power: 0.17, inputs: [['SF-FABRIC', 1.50], ['SF-THREAD', 0.08]], outputs: [['FG-WORKWEAR', 1.0]] },
];

const FG_DEMAND = {
  'FG-BEDDING':  { baseUnits: 20, priceUah:  680, elasticity: -1.3, qualityWeight: 0.70 },
  'FG-JEANS':    { baseUnits: 35, priceUah:  720, elasticity: -1.4, qualityWeight: 0.72 },
  'FG-CARPET':   { baseUnits:  8, priceUah: 2400, elasticity: -1.5, qualityWeight: 0.78 },
  'FG-WORKWEAR': { baseUnits: 25, priceUah:  540, elasticity: -1.1, qualityWeight: 0.68 },
};

// Вхідні (сировина + н/ф) — довідкова ціна + ДержПром SELL
const INPUT_PRICE = { 'RM-FLAX': 22.0, 'SF-LINEN': 90.0, 'SF-DENIM': 95.0, 'SF-THREAD': 70.0 };

async function upsertProduct(p) {
  let product = await prisma.product.findFirst({ where: { sku: p.sku } });
  if (!product) {
    product = await prisma.product.create({
      data: { sku: p.sku, name: p.name, nameUa: p.nameUa, category: p.category, unit: p.unit,
              baseWeightKg: p.weight ?? 1, isEquipmentItem: p.category === 'EQUIPMENT_ITEM' },
    });
    console.log(`  ✓ Продукт: ${p.sku} — ${p.nameUa}`);
  }
  return product;
}

async function main() {
  console.log('\n=== Wave 2: TEXTILE_FACTORY контент ===\n');
  const cities = await prisma.city.findMany({ select: { id: true, population: true, demandCoefficient: true, wageCoefficient: true } });
  const bySku = {};
  for (const p of PRODUCTS) bySku[p.sku] = await upsertProduct(p);
  for (const e of EQUIPMENT) bySku[e.sku] = await upsertProduct({ ...e, category: 'EQUIPMENT_ITEM', unit: 'unit', weight: 1 });

  let recipeCount = 0;
  for (const r of RECIPES) {
    if (await prisma.recipe.findFirst({ where: { name: r.name } })) continue;
    const recipe = await prisma.recipe.create({
      data: { name: r.name, enterpriseType: 'TEXTILE_FACTORY', ticksToComplete: r.ticks,
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

  let demandCount = 0;
  for (const city of cities) {
    for (const [sku, spec] of Object.entries(FG_DEMAND)) {
      const productId = bySku[sku]?.id;
      if (!productId) continue;
      const scaledUnits = spec.baseUnits * (city.population / 1_000_000) * city.demandCoefficient;
      await prisma.npcDemand.upsert({
        where:  { cityId_productId: { cityId: city.id, productId } },
        update: {},
        create: { cityId: city.id, productId, baseUnitsPerDay: scaledUnits,
                  referencePrice: spec.priceUah * city.wageCoefficient,
                  priceElasticity: spec.elasticity, qualityWeight: spec.qualityWeight },
      });
      demandCount++;
    }
  }

  const derzhprom = await prisma.player.findFirst({ where: { username: 'derzhprom' } });
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  for (const [sku, price] of Object.entries(INPUT_PRICE)) {
    const product = bySku[sku];
    if (!product) continue;
    if (!(await prisma.npcDemand.findFirst({ where: { productId: product.id } }))) {
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

  let eqOrders = 0;
  for (const e of EQUIPMENT) {
    const product = bySku[e.sku];
    if (!product) continue;
    if (!(await prisma.npcDemand.findFirst({ where: { productId: product.id } }))) {
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

  console.log(`\n  рецептів: ${recipeCount}, NpcDemand(FG): ${demandCount}, ДержПром техніки: ${eqOrders}`);
  console.log('\n✅ Готово!\n');
}

main().catch(console.error).finally(() => prisma.$disconnect());
