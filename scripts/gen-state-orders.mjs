import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const derzhprom = await p.player.findFirst({ where: { username: 'derzhprom' }, select: { id: true } });
if (!derzhprom) { console.log('ДержПром не знайдено'); process.exit(1); }

await p.marketOrder.updateMany({
  where: { playerId: derzhprom.id, isStateOrder: true, status: { in: ['OPEN', 'PARTIALLY_FILLED'] } },
  data: { status: 'CANCELLED' },
});

const TARGET_SKUS = ['FG-BREAD','FG-MILK','FG-PASTA','FG-SUNOIL','SF-FLOUR','SF-SUGAR','SF-STEEL','SF-PLANKS','CM-BRICK','CM-CEMENT','CM-REBAR'];
const shuffled = TARGET_SKUS.sort(() => Math.random() - 0.5).slice(0, 4);
const products = await p.product.findMany({ where: { sku: { in: shuffled } }, select: { id: true, sku: true, nameUa: true } });

const npcPrices = await p.npcDemand.groupBy({
  by: ['productId'], where: { productId: { in: products.map(x => x.id) } }, _avg: { referencePrice: true },
});
const priceMap = new Map(npcPrices.map(n => [n.productId, Number(n._avg.referencePrice ?? 0)]));

const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
for (const product of products) {
  const ref = priceMap.get(product.id) ?? 30;
  const price = +(ref * 1.20).toFixed(2);
  const qty = Math.round(200 + Math.random() * 800);
  await p.marketOrder.create({
    data: { playerId: derzhprom.id, productId: product.id, resourceType: product.sku, type: 'BUY', status: 'OPEN', pricePerUnit: price, qualityMin: 6.0, quantityTotal: qty, quantityFilled: 0, isStateOrder: true, expiresAt },
  });
  console.log(`✓ ${product.nameUa}: ₴${price} × ${qty} (ref ₴${ref} +20%)`);
}

console.log('\n✅ Держзамовлення виставлено!');
await p.$disconnect();
