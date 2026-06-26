import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const updates = [
  { name: 'Wheat Growing',    ticksToComplete: 3, laborHoursPerUnit: 0.006, baseQuality: 7.5, powerKwhPerUnit: 0.01  },
  { name: 'Sunflower Growing',ticksToComplete: 4, laborHoursPerUnit: 0.007, baseQuality: 7.5, powerKwhPerUnit: 0.01  },
  { name: 'Sugar Beet Growing',ticksToComplete: 4,laborHoursPerUnit: 0.005, baseQuality: 7.2, powerKwhPerUnit: 0.008 },
  { name: 'Dairy Farming',    ticksToComplete: 1, laborHoursPerUnit: 0.04,  baseQuality: 8.5, powerKwhPerUnit: 0.06  },
];

for (const u of updates) {
  const r = await p.recipe.findFirst({ where: { name: u.name } });
  if (!r) { console.log(`⚠ Не знайдено: ${u.name}`); continue; }
  await p.recipe.update({
    where: { id: r.id },
    data: {
      ticksToComplete:   u.ticksToComplete,
      laborHoursPerUnit: u.laborHoursPerUnit,
      baseQuality:       u.baseQuality,
      powerKwhPerUnit:   u.powerKwhPerUnit,
    },
  });
  console.log(`✓ ${u.name}: labor=${u.laborHoursPerUnit}, power=${u.powerKwhPerUnit}, ticks=${u.ticksToComplete}, quality=${u.baseQuality}`);
}

await p.$disconnect();
