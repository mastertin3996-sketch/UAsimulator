import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const workshopId = '3df93140-1052-4ff8-b463-4e5ac9e9dd2a';

const workshop = await p.workshop.findUnique({
  where: { id: workshopId },
  select: {
    id: true, footprintM2: true,
    _count: { select: { equipment: true } },
    enterprise: { select: { type: true } },
  },
});

console.log('Workshop:', workshop?.id, 'type:', workshop?.enterprise?.type);

const entType = workshop.enterprise.type;
const RETAIL_SKUS = ['EQ-CASHREGISTER','EQ-POSTERMINAL','EQ-SHELVING','EQ-DISPLAYFRIDGE',
                     'EQ-FREEZER','EQ-CCTV','EQ-SCALE','EQ-PRICETAG','EQ-SELFCHECKOUT','EQ-CONVEYOR'];
const OFFICE_SKUS = ['EQ-DESK','EQ-OFFCHAIR','EQ-COMPUTER','EQ-PRINTER','EQ-PROJECTOR',
                     'EQ-SERVER','EQ-PBXPHONE','EQ-AIRCON','EQ-COFFEEMACH','EQ-OFFICESAFE'];
const FACTORY_SKUS = ['EQ-MILLGRIND','EQ-OILPRESS','EQ-FURNACE','EQ-TRACTOR','EQ-SAWMILL','EQ-DAIRYLINE'];
const allowedSkus = entType === 'RETAIL_STORE' ? RETAIL_SKUS
                  : entType === 'OFFICE'        ? OFFICE_SKUS
                  : FACTORY_SKUS;

console.log('allowedSkus:', allowedSkus === OFFICE_SKUS ? 'OFFICE' : allowedSkus === RETAIL_SKUS ? 'RETAIL' : 'FACTORY');

const items = await p.product.findMany({
  where: { isEquipmentItem: true, sku: { in: allowedSkus } },
  select: { sku: true, nameUa: true },
  orderBy: { nameUa: 'asc' },
});
console.log('Items returned:', items.map(i => i.nameUa).join(', '));

await p.$disconnect();
