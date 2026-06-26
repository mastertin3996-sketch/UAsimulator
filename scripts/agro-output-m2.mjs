import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

// quantityPerUnit = кг (або л) на 1 м² на тік
const updates = [
  { name: 'Wheat Growing',      sku: 'RM-WHEAT',   qty: 1.5 },
  { name: 'Sunflower Growing',  sku: 'RM-SUNFL',   qty: 0.8 },
  { name: 'Sugar Beet Growing', sku: 'RM-SUGBEET', qty: 5.0 },
  { name: 'Dairy Farming',      sku: 'RM-MILK',    qty: 0.6 },
];

for (const u of updates) {
  const recipe = await p.recipe.findFirst({
    where: { name: u.name },
    include: { outputs: { include: { product: { select: { sku: true } } } } },
  });
  if (!recipe) { console.log(`⚠ Не знайдено: ${u.name}`); continue; }
  const output = recipe.outputs.find(o => o.product.sku === u.sku);
  if (!output) { console.log(`⚠ Output ${u.sku} не знайдено`); continue; }
  await p.recipeOutput.update({ where: { id: output.id }, data: { quantityPerUnit: u.qty } });
  console.log(`✓ ${u.name}: ${u.qty} ${u.sku.includes('MILK') ? 'л' : 'кг'}/м²/тік`);
}

await p.$disconnect();
