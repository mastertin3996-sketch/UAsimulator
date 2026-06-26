import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

// Recalculate monthlyLeaseCostUah = totalAreaM2 * 120 * city.landPriceCoeff
// using ratio: new = old * (120/100)
const plots = await p.landPlot.findMany({
  select: { id: true, monthlyLeaseCostUah: true, totalAreaM2: true },
});

let updated = 0;
for (const plot of plots) {
  const oldMonthly = Number(plot.monthlyLeaseCostUah);
  if (oldMonthly <= 0) continue;
  const newMonthly = +(oldMonthly * (120 / 100)).toFixed(2);
  await p.landPlot.update({ where: { id: plot.id }, data: { monthlyLeaseCostUah: newMonthly } });
  updated++;
}

console.log(`✅ Оновлено ${updated} ділянок: оренда ×1.2 (100→120 грн/м²/міс)`);
await p.$disconnect();
