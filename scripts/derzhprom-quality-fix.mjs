import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const dp = await p.player.findFirst({ where: { isNpcSeller: true } });
console.log('ДержПром:', dp?.id);

// Переглянемо що є
const orders = await p.marketOrder.findMany({
  where: { playerId: dp.id, type: 'SELL', status: 'OPEN' },
  select: { id: true, quality: true, pricePerUnit: true, product: { select: { sku: true, nameUa: true } } },
  orderBy: [{ product: { sku: 'asc' } }, { quality: 'asc' }],
});

// Групуємо по SKU
const bysku = {};
for (const o of orders) {
  const sku = o.product.sku;
  if (!bysku[sku]) bysku[sku] = [];
  bysku[sku].push(o);
}

console.log('\nПоточний стан (SKU → якості):');
for (const [sku, ords] of Object.entries(bysku)) {
  console.log(` ${sku}: ${ords.map(o => `q${o.quality}`).join(', ')}`);
}

// Видаляємо всі крім найвищої якості по кожному SKU
let deleted = 0;
for (const [sku, ords] of Object.entries(bysku)) {
  const maxQ = Math.max(...ords.map(o => o.quality ?? 0));
  const toDelete = ords.filter(o => (o.quality ?? 0) < maxQ).map(o => o.id);
  if (toDelete.length) {
    await p.marketOrder.deleteMany({ where: { id: { in: toDelete } } });
    console.log(`✓ ${sku}: видалено ${toDelete.length} ордери (залишено q${maxQ})`);
    deleted += toDelete.length;
  } else {
    console.log(`⏭  ${sku}: тільки 1 тир, пропущено`);
  }
}

console.log(`\nВидалено ${deleted} ордерів низької/середньої якості`);
await p.$disconnect();
