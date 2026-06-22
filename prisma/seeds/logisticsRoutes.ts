/**
 * Seed script — populates LogisticsRoute with the Ukrainian road distance matrix.
 *
 * Run:  npx ts-node prisma/seeds/logisticsRoutes.ts
 *
 * Prerequisites:
 *  - City rows must already exist (seeded with matching City.name English values).
 *  - Safe to re-run: uses upsert on [fromCityId, toCityId].
 *
 * The matrix is stored bidirectionally (A→B and B→A) so that queries can use
 * a simple WHERE clause without OR.
 */

import { PrismaClient } from '@prisma/client';
import {
  UKRAINE_DISTANCES_KM,
  getDefaultRiskFactor,
} from '../../src/constants/logistics';

const db = new PrismaClient();

async function main(): Promise<void> {
  const cities = await db.city.findMany({ select: { id: true, name: true } });
  const cityByName = new Map(cities.map(c => [c.name, c.id]));

  const missing: string[] = [];

  let upserted = 0;
  let skipped  = 0;

  const cityNames = Object.keys(UKRAINE_DISTANCES_KM);

  for (const fromName of cityNames) {
    const fromId = cityByName.get(fromName);
    if (!fromId) { missing.push(fromName); continue; }

    const targets = UKRAINE_DISTANCES_KM[fromName];
    for (const [toName, distanceKm] of Object.entries(targets)) {
      const toId = cityByName.get(toName);
      if (!toId) { missing.push(toName); continue; }

      const riskFactor  = getDefaultRiskFactor(fromName, toName);
      const roadQuality = riskFactor >= 0.15 ? 0.7 : riskFactor >= 0.10 ? 0.85 : 1.0;

      // Store A→B
      await db.logisticsRoute.upsert({
        where:  { fromCityId_toCityId: { fromCityId: fromId, toCityId: toId } },
        update: { distanceKm, riskFactor, roadQuality },
        create: { fromCityId: fromId, toCityId: toId, distanceKm, riskFactor, roadQuality },
      });

      // Store B→A (same distance, same risk)
      await db.logisticsRoute.upsert({
        where:  { fromCityId_toCityId: { fromCityId: toId, toCityId: fromId } },
        update: { distanceKm, riskFactor, roadQuality },
        create: { fromCityId: toId, toCityId: fromId, distanceKm, riskFactor, roadQuality },
      });

      upserted += 2;
    }
  }

  if (missing.length > 0) {
    const unique = [...new Set(missing)];
    console.warn(`⚠  Cities not found in DB (${unique.length}): ${unique.join(', ')}`);
    console.warn('   Seed those cities first, then re-run this script.');
    skipped = unique.length;
  }

  console.log(`✓ LogisticsRoute seed complete — ${upserted} routes upserted, ${skipped} cities skipped.`);

  // Summary table
  console.log('\nRoute summary (sample — first 10 pairs):');
  const sample = await db.logisticsRoute.findMany({
    take:    10,
    include: { fromCity: { select: { name: true } }, toCity: { select: { name: true } } },
    orderBy: { distanceKm: 'asc' },
  });
  for (const r of sample) {
    console.log(
      `  ${r.fromCity.name.padEnd(20)} → ${r.toCity.name.padEnd(20)} ` +
      `${String(r.distanceKm).padStart(6)} km  ` +
      `risk=${r.riskFactor.toFixed(2)}  road=${r.roadQuality.toFixed(2)}`,
    );
  }
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => db.$disconnect());
