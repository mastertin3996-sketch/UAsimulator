import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const plot = await p.landPlot.findFirst({
  where: { cadastralNumber: 'ODE001' },
  select: { totalAreaM2: true, monthlyLeaseCostUah: true, purchasePriceUah: true },
});
console.log(plot);
await p.$disconnect();
