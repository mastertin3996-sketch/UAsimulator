import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

// Recalculate monthlyLeaseCostUah = 120 * city.landPriceCoeff * totalAreaM2
const plots = await p.landPlot.findMany({
  select: { id: true, totalAreaM2: true, city: { select: { landPriceCoeff: true, name: true } } },
});

for (const plot of plots) {
  const newMonthly = +(120 * Number(plot.city.landPriceCoeff) * plot.totalAreaM2).toFixed(2);
  await p.landPlot.update({ where: { id: plot.id }, data: { monthlyLeaseCostUah: newMonthly } });
  console.log(`${plot.city.name} ${plot.totalAreaM2}м²: ₴${newMonthly}/міс`);
}

console.log(`\n✅ Оновлено ${plots.length} ділянок`);
await p.$disconnect();
