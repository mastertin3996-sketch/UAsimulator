import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  return POST(req);
}

export async function POST(_req: NextRequest) {
  const results: string[] = [];

  // 1. Додаємо колонку enterpriseId (nullable спочатку)
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE tech_research
        ADD COLUMN IF NOT EXISTS "enterpriseId" TEXT;
    `);
    results.push("added enterpriseId column");
  } catch (e) { results.push(`add col error: ${e}`); }

  // 2. Видаляємо старий унікальний індекс на (userId, sector)
  try {
    await prisma.$executeRawUnsafe(`
      DROP INDEX IF EXISTS "tech_research_userId_sector_key";
    `);
    results.push("dropped old userId_sector index");
  } catch (e) { results.push(`drop index error: ${e}`); }

  // 3. Видаляємо старі записи (вони sector-based, несумісні з новою схемою)
  try {
    await prisma.$executeRawUnsafe(`
      DELETE FROM tech_research WHERE "enterpriseId" IS NULL;
    `);
    results.push("deleted old sector-based records");
  } catch (e) { results.push(`delete error: ${e}`); }

  // 4. Робимо enterpriseId NOT NULL
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE tech_research
        ALTER COLUMN "enterpriseId" SET NOT NULL;
    `);
    results.push("set enterpriseId NOT NULL");
  } catch (e) { results.push(`not null error: ${e}`); }

  // 5. Додаємо новий унікальний індекс (userId, enterpriseId)
  try {
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "tech_research_userId_enterpriseId_key"
        ON tech_research("userId", "enterpriseId");
    `);
    results.push("created new userId_enterpriseId unique index");
  } catch (e) { results.push(`create index error: ${e}`); }

  // 6. Додаємо унікальний індекс на enterpriseId (для one-to-one relation)
  try {
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "tech_research_enterpriseId_key"
        ON tech_research("enterpriseId");
    `);
    results.push("created enterpriseId unique index");
  } catch (e) { results.push(`enterpriseId index error: ${e}`); }

  return NextResponse.json({ ok: true, results });
}
