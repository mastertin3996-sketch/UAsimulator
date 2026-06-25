/**
 * ДержПром — державний NPC-продавець на ринку.
 * Запуск: node scripts/setup-derzhprom.mjs
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

// Каталог товарів: { sku, якість → ціна/одиниця }
// Ціни — середньоринкові в Україні 2026 (UAH)
const CATALOG = [
  // ─── Сировина ───────────────────────────────────────────────────
  { sku: 'RM-WHEAT',   tiers: [{ q: 6.5, p: 7.2 }, { q: 7.5, p: 8.5 }, { q: 9.0, p: 10.5 }], qty: 8000 },
  { sku: 'RM-SUNFL',   tiers: [{ q: 6.5, p: 16.0 }, { q: 7.5, p: 19.5 }, { q: 9.0, p: 24.0 }], qty: 5000 },
  { sku: 'RM-SUGBEET', tiers: [{ q: 6.0, p: 3.2 }, { q: 7.5, p: 4.1 }, { q: 9.0, p: 5.0 }], qty: 6000 },
  { sku: 'RM-MILK',    tiers: [{ q: 7.0, p: 12.5 }, { q: 8.0, p: 15.0 }, { q: 9.0, p: 18.5 }], qty: 4000 },
  { sku: 'RM-CORN',    tiers: [{ q: 6.5, p: 6.5 }, { q: 7.5, p: 8.0 }, { q: 9.0, p: 10.0 }], qty: 7000 },
  { sku: 'RM-IRONORE', tiers: [{ q: 6.0, p: 2.5 }, { q: 7.5, p: 3.2 }, { q: 9.0, p: 4.0 }], qty: 10000 },
  { sku: 'RM-COAL',    tiers: [{ q: 6.0, p: 3.8 }, { q: 7.5, p: 4.8 }, { q: 9.0, p: 6.0 }], qty: 10000 },
  { sku: 'RM-LUMBER',  tiers: [{ q: 6.5, p: 9.0 }, { q: 7.5, p: 12.0 }, { q: 9.0, p: 15.5 }], qty: 6000 },

  // ─── Напівфабрикати ─────────────────────────────────────────────
  { sku: 'SF-FLOUR',  tiers: [{ q: 6.5, p: 24.0 }, { q: 7.5, p: 30.0 }, { q: 9.0, p: 38.0 }], qty: 5000 },
  { sku: 'SF-SUGAR',  tiers: [{ q: 7.0, p: 29.0 }, { q: 8.0, p: 36.0 }, { q: 9.0, p: 44.0 }], qty: 4000 },
  { sku: 'SF-STEEL',  tiers: [{ q: 6.5, p: 34.0 }, { q: 7.5, p: 43.0 }, { q: 9.0, p: 54.0 }], qty: 5000 },
  { sku: 'SF-PLANKS', tiers: [{ q: 6.5, p: 18.0 }, { q: 7.5, p: 24.0 }, { q: 9.0, p: 30.0 }], qty: 5000 },

  // ─── Будматеріали ───────────────────────────────────────────────
  { sku: 'CM-BRICK',    tiers: [{ q: 6.0, p: 8.5 },  { q: 7.5, p: 12.0 }, { q: 9.0, p: 15.0 }], qty: 15000 },
  { sku: 'CM-SAND',     tiers: [{ q: 6.0, p: 0.6 },  { q: 7.5, p: 0.9 },  { q: 9.0, p: 1.2 }],  qty: 20000 },
  { sku: 'CM-GRAVEL',   tiers: [{ q: 6.0, p: 0.9 },  { q: 7.5, p: 1.3 },  { q: 9.0, p: 1.7 }],  qty: 20000 },
  { sku: 'CM-CONCRETE', tiers: [{ q: 6.0, p: 4.8 },  { q: 7.5, p: 6.5 },  { q: 9.0, p: 8.5 }],  qty: 8000 },
  { sku: 'CM-CEMENT',   tiers: [{ q: 6.5, p: 4.2 },  { q: 7.5, p: 5.5 },  { q: 9.0, p: 7.0 }],  qty: 8000 },
  { sku: 'CM-REBAR',    tiers: [{ q: 7.0, p: 44.0 }, { q: 8.0, p: 56.0 }, { q: 9.0, p: 70.0 }],  qty: 3000 },
  { sku: 'CM-TIMBER',   tiers: [{ q: 6.5, p: 10.5 }, { q: 7.5, p: 14.0 }, { q: 9.0, p: 18.0 }],  qty: 4000 },

  // ─── Обладнання ─────────────────────────────────────────────────
  { sku: 'EQ-MILLGRIND',  tiers: [{ q: 6.0, p: 145000 }, { q: 7.5, p: 185000 }, { q: 9.0, p: 235000 }], qty: 10 },
  { sku: 'EQ-OILPRESS',   tiers: [{ q: 6.0, p: 175000 }, { q: 7.5, p: 225000 }, { q: 9.0, p: 285000 }], qty: 10 },
  { sku: 'EQ-FURNACE',    tiers: [{ q: 6.0, p: 430000 }, { q: 7.5, p: 560000 }, { q: 9.0, p: 720000 }], qty: 5  },
  { sku: 'EQ-TRACTOR',    tiers: [{ q: 6.0, p: 980000 }, { q: 7.5, p: 1280000 },{ q: 9.0, p: 1650000 }],qty: 5  },
  { sku: 'EQ-SAWMILL',    tiers: [{ q: 6.0, p: 265000 }, { q: 7.5, p: 345000 }, { q: 9.0, p: 440000 }], qty: 10 },
  { sku: 'EQ-DAIRYLINE',  tiers: [{ q: 6.0, p: 355000 }, { q: 7.5, p: 460000 }, { q: 9.0, p: 590000 }], qty: 5  },
];

const TIER_LABELS = ['Економ', 'Стандарт', 'Преміум'];

async function main() {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   Налаштування ДержПром NPC-продавця    ║');
  console.log('╚══════════════════════════════════════════╝\n');

  // 1. Знайти або створити ДержПром гравця
  let player = await prisma.player.findFirst({ where: { username: 'derzhprom' } });
  if (!player) {
    const hash = await bcrypt.hash('derzhprom-internal-2026', 10);
    player = await prisma.player.create({
      data: {
        email:       'derzhprom@state.ua',
        username:    'derzhprom',
        passwordHash: hash,
        companyName: 'ДержПром',
        isNpcSeller: true,
        isActive:    true,
        cashBalance: 999_999_999,
      },
    });
    console.log(`✓ Створено гравця ДержПром (id: ${player.id})`);
  } else {
    await prisma.player.update({
      where: { id: player.id },
      data: { isNpcSeller: true, companyName: 'ДержПром' },
    });
    console.log(`✓ Гравець ДержПром вже існує (id: ${player.id})`);
  }

  // 2. Скасувати старі ордери ДержПром
  const cancelled = await prisma.marketOrder.updateMany({
    where: { playerId: player.id, status: { in: ['OPEN', 'PARTIALLY_FILLED'] } },
    data:  { status: 'CANCELLED' },
  });
  if (cancelled.count > 0) console.log(`  → Скасовано ${cancelled.count} старих ордерів`);

  // 3. Очистити playerInventory ДержПром
  await prisma.playerInventory.deleteMany({ where: { playerId: player.id } });

  // 4. Створити нові ордери і поповнити інвентар
  let ordersCreated = 0;
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 рік

  for (const item of CATALOG) {
    const product = await prisma.product.findFirst({ where: { sku: item.sku } });
    if (!product) { console.warn(`  ⚠ Продукт ${item.sku} не знайдено`); continue; }

    // Поповнення playerInventory для кожного тіру
    for (const tier of item.tiers) {
      const tierQty = item.qty;

      // PlayerInventory (ескроу для matchOrders)
      await prisma.playerInventory.upsert({
        where:  { playerId_productId: { playerId: player.id, productId: product.id } },
        update: { quantity: { increment: tierQty }, avgQuality: tier.q },
        create: { playerId: player.id, productId: product.id, quantity: tierQty, avgQuality: tier.q },
      });

      await prisma.marketOrder.create({
        data: {
          playerId:      player.id,
          productId:     product.id,
          resourceType:  item.sku,
          type:          'SELL',
          status:        'OPEN',
          pricePerUnit:  tier.p,
          quality:       tier.q,
          quantityTotal: tierQty,
          quantityFilled: 0,
          expiresAt,
        },
      });
      ordersCreated++;
    }

    process.stdout.write(`  ✓ ${item.sku.padEnd(14)} — ${item.tiers.length} тіри\n`);
  }

  console.log(`\n✅ Готово! Створено ${ordersCreated} ордерів для ${CATALOG.length} товарів.`);
  console.log(`   Гравець: derzhprom | ID: ${player.id}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
