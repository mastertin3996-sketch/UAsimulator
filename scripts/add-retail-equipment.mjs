/**
 * Додає торгове обладнання для RETAIL_STORE до Product + NpcDemand
 * Запуск: node scripts/add-retail-equipment.mjs
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

const ITEMS = [
  { sku: 'EQ-CASHREGISTER', name: 'Cash Register',          nameUa: 'Касовий апарат',            price: 22000  },
  { sku: 'EQ-POSTERMINAL',  name: 'POS Terminal',           nameUa: 'POS термінал',               price: 12000  },
  { sku: 'EQ-SHELVING',     name: 'Display Shelving',       nameUa: 'Торгові стелажі',            price: 18000  },
  { sku: 'EQ-DISPLAYFRIDGE',name: 'Display Refrigerator',   nameUa: 'Холодильна вітрина',         price: 65000  },
  { sku: 'EQ-FREEZER',      name: 'Commercial Freezer',     nameUa: 'Морозильна камера',          price: 55000  },
  { sku: 'EQ-CCTV',         name: 'CCTV System',            nameUa: 'Система відеоспостереження', price: 28000  },
  { sku: 'EQ-SCALE',        name: 'Commercial Scale',       nameUa: 'Торгові ваги',               price: 9500   },
  { sku: 'EQ-PRICETAG',     name: 'Electronic Price Labels',nameUa: 'Електронні цінники',         price: 35000  },
  { sku: 'EQ-SELFCHECKOUT', name: 'Self-Checkout Kiosk',    nameUa: 'Термінал самообслуговування',price: 145000 },
  { sku: 'EQ-CONVEYOR',     name: 'Checkout Conveyor',      nameUa: 'Касова стрічка',             price: 18500  },
];

async function main() {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   Торгове обладнання для RETAIL_STORE   ║');
  console.log('╚══════════════════════════════════════════╝\n');

  // Всі міста — для NpcDemand (потрібні для basePrice у каталозі)
  const cities = await prisma.city.findMany({ select: { id: true } });

  for (const item of ITEMS) {
    // Знайти або створити продукт
    let product = await prisma.product.findFirst({ where: { sku: item.sku } });
    if (!product) {
      product = await prisma.product.create({
        data: {
          sku:             item.sku,
          name:            item.name,
          nameUa:          item.nameUa,
          category:        'EQUIPMENT_ITEM',
          unit:            'unit',
          isEquipmentItem: true,
        },
      });
      console.log(`  ✓ Створено: ${item.sku} — ${item.nameUa}`);
    } else {
      console.log(`  → Вже існує: ${item.sku}`);
    }

    // NpcDemand для першого міста (потрібен для відображення ціни в каталозі)
    const existing = await prisma.npcDemand.findFirst({ where: { productId: product.id } });
    if (!existing) {
      await prisma.npcDemand.create({
        data: {
          productId:       product.id,
          cityId:          cities[0].id,
          baseUnitsPerDay: 0.1,
          referencePrice:  item.price,
        },
      });
    }
  }

  // Поповнити ДержПром новим торговим обладнанням
  const derzhprom = await prisma.player.findFirst({ where: { username: 'derzhprom' } });
  if (derzhprom) {
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    let added = 0;

    for (const item of ITEMS) {
      const product = await prisma.product.findFirst({ where: { sku: item.sku } });
      if (!product) continue;

      // Три тіри якості
      const tiers = [
        { q: 6.0, p: Math.round(item.price * 0.80) },
        { q: 7.5, p: item.price },
        { q: 9.0, p: Math.round(item.price * 1.25) },
      ];

      // Скасувати старі ордери цього продукту від ДержПром
      await prisma.marketOrder.updateMany({
        where: { playerId: derzhprom.id, productId: product.id, status: { in: ['OPEN', 'PARTIALLY_FILLED'] } },
        data:  { status: 'CANCELLED' },
      });

      for (const tier of tiers) {
        const qty = 10;

        await prisma.playerInventory.upsert({
          where:  { playerId_productId: { playerId: derzhprom.id, productId: product.id } },
          update: { quantity: { increment: qty } },
          create: { playerId: derzhprom.id, productId: product.id, quantity: qty, avgQuality: tier.q },
        });

        await prisma.marketOrder.create({
          data: {
            playerId:       derzhprom.id,
            productId:      product.id,
            resourceType:   item.sku,
            type:           'SELL',
            status:         'OPEN',
            pricePerUnit:   tier.p,
            quality:        tier.q,
            quantityTotal:  qty,
            quantityFilled: 0,
            expiresAt,
          },
        });
        added++;
      }
    }

    console.log(`\n  🏛️ ДержПром: додано ${added} ордерів торгового обладнання`);
  }

  console.log('\n✅ Готово!\n');
}

main().catch(console.error).finally(() => prisma.$disconnect());
