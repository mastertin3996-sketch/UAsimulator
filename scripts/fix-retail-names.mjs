import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const names = {
  'EQ-CASHREGISTER':  { name: 'Касовий апарат',            nameUa: 'Касовий апарат' },
  'EQ-POSTERMINAL':   { name: 'POS-термінал',               nameUa: 'POS-термінал' },
  'EQ-SHELVING':      { name: 'Стелаж для товарів',         nameUa: 'Стелаж для товарів' },
  'EQ-DISPLAYFRIDGE': { name: 'Вітринний холодильник',      nameUa: 'Вітринний холодильник' },
  'EQ-FREEZER':       { name: 'Морозильна камера',          nameUa: 'Морозильна камера' },
  'EQ-CCTV':          { name: 'Відеоспостереження',         nameUa: 'Відеоспостереження' },
  'EQ-SCALE':         { name: 'Торгові ваги',               nameUa: 'Торгові ваги' },
  'EQ-PRICETAG':      { name: 'Електронні цінники',         nameUa: 'Електронні цінники' },
  'EQ-SELFCHECKOUT':  { name: 'Каса самообслуговування',    nameUa: 'Каса самообслуговування' },
  'EQ-CONVEYOR':      { name: 'Стрічковий конвеєр',         nameUa: 'Стрічковий конвеєр' },
};

for (const [sku, data] of Object.entries(names)) {
  const updated = await p.product.updateMany({ where: { sku }, data });
  console.log(updated.count ? `✓ ${sku} → ${data.nameUa}` : `⏭  ${sku} не знайдено`);
}

// Також оновлюємо назви вже встановленого обладнання (Equipment.name)
for (const [sku, data] of Object.entries(names)) {
  const prod = await p.product.findUnique({ where: { sku } });
  if (!prod) continue;
  const r = await p.equipment.updateMany({ where: { catalogProductId: prod.id }, data: { name: data.nameUa } });
  if (r.count) console.log(`  ↳ оновлено ${r.count} встановлених одиниць`);
}

await p.$disconnect();
