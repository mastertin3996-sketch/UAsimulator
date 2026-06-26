import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const ent = await p.enterprise.findFirst({ where: { type: 'OFFICE' }, select: { id: true, name: true, type: true, workshops: { select: { id: true } } } });
console.log('Office enterprise:', ent);
if (ent?.workshops[0]) {
  const ws = await p.workshop.findUnique({ where: { id: ent.workshops[0].id }, select: { id: true, enterprise: { select: { type: true } } } });
  console.log('Workshop enterprise.type:', ws?.enterprise?.type);
}
await p.$disconnect();
