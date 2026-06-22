import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  // GET also runs the migration directly
  return POST(req);
}

export async function POST(req: NextRequest) {
  const tickSecret = process.env.TICK_SECRET ?? "";
  if (tickSecret) {
    const secret = req.headers.get("x-admin-secret") ?? "";
    if (secret !== tickSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const results: string[] = [];

  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE shop_settings
        ADD COLUMN IF NOT EXISTS display_limit INT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
    `);
    results.push("columns added");
  } catch (e) { results.push(`columns error: ${e}`); }

  // Drop old single-column unique INDEX (it's an index, not a constraint)
  try {
    await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "shop_settings_enterpriseId_key";`);
    results.push("dropped old single-column index");
  } catch (e) { results.push(`drop index error: ${e}`); }

  try {
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "shop_settings_enterpriseId_productId_key"
        ON shop_settings("enterpriseId", "productId");
    `);
    results.push("compound index created");
  } catch (e) { results.push(`index error: ${e}`); }

  return NextResponse.json({ ok: true, results });
}
