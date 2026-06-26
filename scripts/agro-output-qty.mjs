import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const updates = [
  { name: 'Wheat Growing',     sku: 'RM-WHEAT',  qty: 15 },
  { name: 'Sunflower Growing', sku: 'RM-SUNFL',  qty: 8  },
  { name: 'Sugar Beet Growing',sku: 'RM-SUGBEET', qty: 50 },
  { name: 'Dairy Farming',     sku: 'RM-MILK',   qty: 6  },
];

for (const u of updates) {
  const recipe = await p.recipe.findFirst({ where: { name: u.name }, include: { outputs: { include: { product: { select: { sku: true } } } } } });
  if (!recipe) { console.log(`⚠ Не знайдено: ${u.name}`); continue; }
  const output = recipe.outputs.find(o => o.product.sku === u.sku);
  if (!output) { console.log(`⚠ Output ${u.sku} не знайдено у ${u.name}`); continue; }
  await p.recipeOutput.update({ where: { id: output.id }, data: { quantityPerUnit: u.qty } });
  console.log(`✓ ${u.name}: ${u.sku} qty 1 → ${u.qty} (=${u.qty * 100} кг/тік при maxCap=100)`);
}

await p.$disconnect();
