import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const firstCity = await p.city.findFirst({ select: { id: true } });
const cityId = firstCity.id;

const OFFICE_EQ = [
  { sku: 'EQ-DESK',       name: 'Office Desk',          nameUa: 'Офісний стіл',        price: 12_000  },
  { sku: 'EQ-OFFCHAIR',   name: 'Office Chair',          nameUa: 'Офісне крісло',       price:  8_000  },
  { sku: 'EQ-COMPUTER',   name: 'Desktop Computer',      nameUa: 'Комп\'ютер',           price: 28_000  },
  { sku: 'EQ-PRINTER',    name: 'Office Printer',        nameUa: 'Принтер/МФУ',         price: 14_000  },
  { sku: 'EQ-PROJECTOR',  name: 'Projector',             nameUa: 'Проектор',            price: 32_000  },
  { sku: 'EQ-SERVER',     name: 'Server',                nameUa: 'Сервер',              price: 90_000  },
  { sku: 'EQ-PBXPHONE',   name: 'PBX Phone System',      nameUa: 'Телефонна АТС',       price: 22_000  },
  { sku: 'EQ-AIRCON',     name: 'Air Conditioner',       nameUa: 'Кондиціонер',         price: 18_000  },
  { sku: 'EQ-COFFEEMACH', name: 'Coffee Machine',        nameUa: 'Кавова машина',       price: 16_000  },
  { sku: 'EQ-OFFICESAFE', name: 'Office Safe',           nameUa: 'Офісний сейф',        price: 24_000  },
];

let created = 0, skipped = 0;
for (const eq of OFFICE_EQ) {
  const existing = await p.product.findUnique({ where: { sku: eq.sku } });
  if (existing) { skipped++; console.log(`⏭  ${eq.sku} вже існує`); continue; }

  const product = await p.product.create({
    data: {
      sku: eq.sku, name: eq.name, nameUa: eq.nameUa,
      category: 'EQUIPMENT_ITEM', unit: 'unit', isEquipmentItem: true,
    },
  });

  const existingDemand = await p.npcDemand.findFirst({ where: { productId: product.id } });
  if (!existingDemand) {
    await p.npcDemand.create({
      data: { productId: product.id, cityId, baseUnitsPerDay: 0.1, referencePrice: eq.price },
    });
  }

  created++;
  console.log(`✓ ${eq.sku} — ${eq.nameUa} (₴${eq.price.toLocaleString()})`);
}

// ДержПром SELL orders (3 тири × 10 позицій)
const derzhprom = await p.player.findFirst({ where: { username: 'derzhprom' }, select: { id: true } });
if (derzhprom) {
  const products = await p.product.findMany({ where: { sku: { in: OFFICE_EQ.map(e => e.sku) } }, select: { id: true, sku: true } });
  const priceMap = new Map(OFFICE_EQ.map(e => [e.sku, e.price]));
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const TIERS = [
    { mult: 1.0, qty: 10, q: 7.0 },
    { mult: 1.3, qty:  5, q: 8.5 },
    { mult: 1.6, qty:  3, q: 9.5 },
  ];
  let orders = 0;
  for (const prod of products) {
    const base = priceMap.get(prod.sku) ?? 20_000;
    await p.playerInventory.upsert({
      where: { playerId_productId: { playerId: derzhprom.id, productId: prod.id } },
      update: { quantity: { increment: TIERS.reduce((s, t) => s + t.qty, 0) } },
      create: { playerId: derzhprom.id, productId: prod.id, quantity: TIERS.reduce((s, t) => s + t.qty, 0), avgQuality: 7 },
    });
    for (const tier of TIERS) {
      await p.marketOrder.create({
        data: { playerId: derzhprom.id, productId: prod.id, resourceType: prod.sku, type: 'SELL', status: 'OPEN',
                pricePerUnit: +(base * tier.mult).toFixed(0), quality: tier.q,
                quantityTotal: tier.qty, quantityFilled: 0, expiresAt },
      });
      orders++;
    }
  }
  console.log(`\n🏛  ДержПром: ${orders} ордерів виставлено`);
}

console.log(`\n✅ Створено ${created}, пропущено ${skipped}`);
await p.$disconnect();
