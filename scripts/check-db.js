const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const [city, plots, prods, recipes, playerCount, lastTick] = await Promise.all([
    p.city.findFirst({ select: { id: true, nameUa: true } }),
    p.landPlot.findMany({ where: { status: 'AVAILABLE', playerId: null }, take: 15, select: { id: true, cityId: true, totalAreaM2: true, purchasePriceUah: true } }),
    p.product.findMany({ take: 10, select: { id: true, nameUa: true, unit: true } }),
    p.recipe.findMany({ take: 10, select: { id: true, name: true, enterpriseType: true } }),
    p.player.count(),
    p.gameTick.findFirst({ orderBy: { tickNumber: 'desc' }, select: { tickNumber: true } }),
  ]);

  const ser = (v) => JSON.stringify(v, (k, val) => typeof val === 'bigint' ? val.toString() : val, 2);
  console.log('city:', ser(city));
  console.log('plots:', plots.length, ser(plots[0]));
  console.log('products:', ser(prods));
  console.log('recipes:', ser(recipes));
  console.log('playerCount:', playerCount);
  console.log('lastTick:', lastTick ? lastTick.tickNumber.toString() : 'none');
}

main().catch(console.error).finally(() => p.$disconnect());
