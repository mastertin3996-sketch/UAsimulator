import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const ents = await p.enterprise.findMany({
  select: { id: true, name: true, type: true, workshops: { select: { id: true, name: true, footprintM2: true } } }
});
console.log('All enterprises:');
for (const e of ents) {
  console.log(` [${e.type}] ${e.name} (${e.id.slice(0,8)})`);
  for (const w of e.workshops) {
    const ws = await p.workshop.findUnique({ where: { id: w.id }, select: { enterprise: { select: { type: true } } } });
    console.log(`   - Workshop: ${w.name} (${w.id.slice(0,8)}) → enterprise.type=${ws?.enterprise?.type}`);
  }
}
await p.$disconnect();
