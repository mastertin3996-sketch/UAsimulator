import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const r = await p.landPlot.updateMany({
  where: { playerId: '9027a388-32a5-4b86-8068-d4ded22ee72a' },
  data: { playerId: null, status: 'AVAILABLE', leaseStartDate: null, usedAreaM2: 0 },
});
console.log('Cleared plots:', r.count);
await p.$disconnect();
