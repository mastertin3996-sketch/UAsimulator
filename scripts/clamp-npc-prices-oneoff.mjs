// Одноразова корекція: обмежити referencePrice, що вже перевищує 1.4x базової ціни
// (наслідок відсутності стелі до цього фіксу), не чекаючи наступного тіку.
import { PrismaClient } from '@prisma/client';

const NPC_BASE_PRICES = {
  'RM-WHEAT': 3.8, 'RM-CORN': 3.2, 'RM-SUNFL': 6.5, 'RM-SUGBEET': 1.4, 'RM-BARLEY': 3.0,
  'RM-MILK': 8.5, 'RM-IRONORE': 4.2, 'RM-COAL': 3.6, 'RM-LUMBER': 12.0,
  'RM-COTTON': 28.0, 'RM-WOOL': 45.0,
  'SF-FLOUR': 8.5, 'SF-SUGAR': 15.0, 'SF-CORN-STARCH': 11.0, 'SF-MALT': 18.0,
  'SF-STEEL': 42.0, 'SF-PLANKS': 15.0, 'SF-FABRIC': 65.0, 'SF-YARN': 55.0,
  'RM-LIVESTOCK': 250, 'RM-CATTLE': 45_000, 'RM-PIGS': 12_000, 'RM-POULTRY': 120,
  'SF-MILK': 8.5, 'RM-WHEAT-ORG': 9_500, 'RM-CORN-ORG': 7_200,
  'FG-BREAD': 32, 'FG-SUNOIL': 75, 'FG-MILK': 28, 'FG-PASTA': 52, 'FG-STEEL-P': 185,
  'FG-FURN': 8_500, 'FG-MEAT': 175, 'FG-CAKE': 145, 'FG-CORN-SYRUP': 95,
  'FG-CONDENSED-MILK': 88, 'FG-CHEESE': 185, 'FG-BUTTER': 220, 'FG-SAUSAGE': 210,
  'FG-HONEY': 380, 'FG-BEER': 55, 'FG-SPIRITS': 220, 'FG-CLOTHING': 850,
  'FG-KNITWEAR': 680, 'FG-BEEF': 290, 'FG-PORK': 195, 'FG-CHICKEN': 125, 'FG-EGGS': 58,
  'AG-FERTILIZER': 200.0, 'SF-COMPOST': 1.3, 'RM-PESTICIDE': 4.5,
  'CM-CEMENT': 3_800, 'CM-SAND': 450, 'CM-GRAVEL': 800, 'CM-BRICK': 9,
  'CM-CONCRETE': 4_500, 'CM-REBAR': 42_000, 'CM-TIMBER': 12_000,
};
const CEILING_MULT = 1.4;

const p = new PrismaClient();

const products = await p.product.findMany({
  where: { sku: { in: Object.keys(NPC_BASE_PRICES) } },
  select: { id: true, sku: true },
});

let fixed = 0;
for (const prod of products) {
  const ceiling = NPC_BASE_PRICES[prod.sku] * CEILING_MULT;
  const res = await p.npcDemand.updateMany({
    where: { productId: prod.id, referencePrice: { gt: ceiling } },
    data: { referencePrice: ceiling },
  });
  if (res.count > 0) {
    console.log(`${prod.sku}: clamped ${res.count} row(s) to ${ceiling}`);
    fixed += res.count;
  }
}
console.log(`Total rows clamped: ${fixed}`);
await p.$disconnect();
