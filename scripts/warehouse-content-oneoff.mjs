/**
 * Wave 3 (WAREHOUSE) — одноразова вставка складської техніки в прод-БД.
 * Лише техніка (немає нових FG → 0 економічного ризику). Ідемпотентний.
 * Запуск: node scripts/warehouse-content-oneoff.mjs
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

const EQUIPMENT = [
  { sku: 'EQ-RACKING',  name: 'Racking Systems', nameUa: 'Стелажні системи',  price: 120000 },
  { sku: 'EQ-FORKLIFT', name: 'Forklift',        nameUa: 'Навантажувач',      price: 180000 },
  { sku: 'EQ-CLIMATE',  name: 'Climate Control', nameUa: 'Клімат-контроль',   price: 220000 },
  { sku: 'EQ-COLDROOM', name: 'Cold Room',       nameUa: 'Холодильна камера', price: 340000 },
  { sku: 'EQ-WMS',      name: 'WMS System',      nameUa: 'Система WMS',        price: 160000 },
];

async function main() {
  console.log('\n=== Wave 3: WAREHOUSE техніка ===\n');
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

  console.log(`\n  ДержПром ордерів техніки: ${eqOrders}`);
  console.log('\n✅ Готово!\n');
}

main().catch(console.error).finally(() => prisma.$disconnect());
