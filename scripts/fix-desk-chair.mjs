import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const city = await p.city.findFirst({ select: { id: true } });
const prices = { 'EQ-DESK': 12000, 'EQ-OFFCHAIR': 8000 };
for (const [sku, price] of Object.entries(prices)) {
  const prod = await p.product.findUnique({ where: { sku } });
  if (!prod) { console.log(`${sku} not found`); continue; }
  const d = await p.npcDemand.findFirst({ where: { productId: prod.id } });
  if (!d) {
    await p.npcDemand.create({ data: { productId: prod.id, cityId: city.id, baseUnitsPerDay: 0.1, referencePrice: price } });
    console.log(`✓ NpcDemand created for ${sku}`);
  } else { console.log(`⏭  ${sku} already has demand`); }
}
await p.$disconnect();
