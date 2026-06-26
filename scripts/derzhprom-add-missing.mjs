import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const dp = await p.player.findFirst({ where: { isNpcSeller: true } });

// Всі товари що продаються (не обладнання)
const allProducts = await p.product.findMany({
  where: { isEquipmentItem: false },
  select: { id: true, sku: true, nameUa: true, npcDemand: { select: { referencePrice: true }, take: 1 } },
});

// Вже є у ДержПром
const existing = await p.marketOrder.findMany({
  where: { playerId: dp.id, type: 'SELL', status: 'OPEN' },
  select: { productId: true },
});
const existingIds = new Set(existing.map(o => o.productId));

const missing = allProducts.filter(pr => !existingIds.has(pr.id));
console.log(`Відсутні у ДержПром (${missing.length}):`);
for (const pr of missing) {
  console.log(` - ${pr.sku}: ${pr.nameUa} (refPrice: ${pr.npcDemand[0]?.referencePrice ?? 'немає'})`);
}

// Додаємо SELL ордери (вища якість q9, 500 одиниць, ціна +20% від referencePrice)
const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
let added = 0;
for (const pr of missing) {
  const refPrice = Number(pr.npcDemand[0]?.referencePrice ?? 0);
  if (!refPrice) { console.log(`  ⚠ ${pr.sku}: немає refPrice, пропускаємо`); continue; }
  const price = +(refPrice * 1.20).toFixed(4);
  await p.marketOrder.create({
    data: {
      playerId: dp.id, productId: pr.id,
      resourceType: pr.sku,
      type: 'SELL', status: 'OPEN',
      pricePerUnit: price, quality: 9,
      quantityTotal: 500, quantityFilled: 0,
      expiresAt,
    },
  });
  console.log(`✓ ${pr.sku}: q9, ₴${price}, 500 од.`);
  added++;
}

console.log(`\nДодано ${added} нових ордерів`);
await p.$disconnect();
