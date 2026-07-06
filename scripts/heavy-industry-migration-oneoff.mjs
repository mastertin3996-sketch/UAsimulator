/**
 * HEAVY_INDUSTRY — одноразова корекція прод-БД.
 * 1) Перепризначає 4 існуючі рецепти (Steel Smelting/Fabrication, Sawmilling, Furniture)
 *    з TEXTILE_FACTORY на щойно доданий HEAVY_INDUSTRY (виправлення "поки найближчий тип").
 * 2) Вставляє 2 нові SKU техніки (EQ-BLASTFURNACE, EQ-WOODPLANER) + NpcDemand + ДержПром SELL-ордери.
 * Ідемпотентний. Потребує, щоб міграція enum HEAVY_INDUSTRY вже була застосована (prisma migrate deploy).
 * Запуск: node scripts/heavy-industry-migration-oneoff.mjs
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

const RECIPE_NAMES = ['Steel Smelting', 'Steel Product Fabrication', 'Sawmilling', 'Furniture Manufacturing'];

const EQUIPMENT = [
  { sku: 'EQ-BLASTFURNACE', name: 'Blast Furnace', nameUa: 'Доменна піч',           price: 520000 },
  { sku: 'EQ-WOODPLANER',   name: 'Wood Planer',   nameUa: 'Стругальний верстат',   price: 210000 },
];

async function main() {
  console.log('\n=== HEAVY_INDUSTRY: корекція даних ===\n');

  // 1) Перепризначення рецептів
  const recipes = await prisma.recipe.findMany({
    where: { name: { in: RECIPE_NAMES }, enterpriseType: 'TEXTILE_FACTORY' },
    select: { id: true, name: true },
  });
  if (recipes.length === 0) {
    console.log('  Рецептів під TEXTILE_FACTORY не знайдено (вже перепризначені або відсутні).');
  } else {
    const { count } = await prisma.recipe.updateMany({
      where: { id: { in: recipes.map(r => r.id) } },
      data:  { enterpriseType: 'HEAVY_INDUSTRY' },
    });
    console.log(`  ✓ Перепризначено рецептів: ${count} (${recipes.map(r => r.name).join(', ')})`);
  }

  // 2) Техніка
  const cities = await prisma.city.findMany({ select: { id: true } });
  const derzhprom = await prisma.player.findFirst({ where: { username: 'derzhprom' } });
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  let eqOrders = 0;

  for (const e of EQUIPMENT) {
    let product = await prisma.product.findFirst({ where: { sku: e.sku } });
    if (!product) {
      product = await prisma.product.create({
        data: { sku: e.sku, name: e.name, nameUa: e.nameUa, category: 'EQUIPMENT_ITEM', unit: 'unit', isEquipmentItem: true },
      });
      console.log(`  ✓ Техніка: ${e.sku} — ${e.nameUa}`);
    }
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

  console.log(`\n  ДержПром ордерів техніки важкої промисловості: ${eqOrders}`);
  console.log('\n✅ Готово!\n');
}

main().catch(console.error).finally(() => prisma.$disconnect());
