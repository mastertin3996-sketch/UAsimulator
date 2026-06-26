import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const wsId = '3df93140-1052-4ff8-b463-4e5ac9e9dd2a';
const workshop = await p.workshop.findUnique({
  where: { id: wsId },
  select: { id: true, enterprise: { select: { type: true } } },
});
console.log('workshop.enterprise.type:', workshop?.enterprise?.type);

const OFFICE_SKUS = ['EQ-DESK','EQ-OFFCHAIR','EQ-COMPUTER','EQ-PRINTER','EQ-PROJECTOR',
                     'EQ-SERVER','EQ-PBXPHONE','EQ-AIRCON','EQ-COFFEEMACH','EQ-OFFICESAFE'];
const items = await p.product.findMany({
  where: { isEquipmentItem: true, sku: { in: OFFICE_SKUS } },
  select: { sku: true, nameUa: true, isEquipmentItem: true },
});
console.log('Office equipment in DB:', items.length);
items.forEach(i => console.log(` - ${i.sku}: ${i.nameUa} (isEq:${i.isEquipmentItem})`));

await p.$disconnect();
