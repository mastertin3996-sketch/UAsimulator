/**
 * Wave 4 (LOGISTICS_HUB) — одноразова вставка флоту/техніки в прод-БД.
 * Лише техніка. Ідемпотентний. Запуск: node scripts/logistics-content-oneoff.mjs
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

const EQUIPMENT = [
  { sku: 'EQ-TRUCK-SMALL', name: 'Light Truck',  nameUa: 'Легка вантажівка', price: 450000  },
  { sku: 'EQ-TRUCK-HEAVY', name: 'Heavy Truck',  nameUa: 'Фура (тягач)',     price: 1200000 },
  { sku: 'EQ-REEFER',      name: 'Reefer Truck', nameUa: 'Рефрижератор',     price: 900000  },
  { sku: 'EQ-CRANE',       name: 'Cargo Crane',  nameUa: 'Вантажний кран',   price: 650000  },
];

async function main() {
  console.log('\n=== Wave 4: LOGISTICS_HUB флот ===\n');
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
        const qty = 5;
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

  console.log(`\n  ДержПром ордерів флоту: ${eqOrders}`);
  console.log('\n✅ Готово!\n');
}

main().catch(console.error).finally(() => prisma.$disconnect());
