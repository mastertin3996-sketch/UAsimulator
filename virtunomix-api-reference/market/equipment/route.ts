/**
 * GET /api/market/equipment?cityId=...
 *
 * Повертає поточні NPC-пропозиції обладнання для вказаного міста.
 * Кожна пропозиція збагачується статичними даними з EQUIPMENT_TYPES
 * (назва, тип цеху, іконка, характеристики).
 *
 * Кешується на TTL_EQUIPMENT секунд; інвалідується generateNpcMarket().
 */

import { NextRequest, NextResponse } from "next/server";
import { auth }    from "@/lib/auth";
import { prisma }  from "@/lib/prisma";
import { cache }   from "@/lib/cache";
import { EQUIPMENT_TYPES } from "@/lib/equipment-config";

const TTL_EQUIPMENT = 120; // 2 хвилини

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cityId = req.nextUrl.searchParams.get("cityId") ?? "";

  const cacheKey = `equip-market:${cityId || "all"}`;
  const cached = cache.get<unknown>(cacheKey);
  if (cached) return NextResponse.json(cached);

  const where = {
    expiresAt: { gt: new Date() },
    ...(cityId ? { cityId } : {}),
  };

  const listings = await prisma.npcEquipmentListing.findMany({
    where,
    include: { city: { select: { id: true, name: true } } },
    orderBy: [{ cityId: "asc" }, { priceGc: "asc" }],
    take   : 500,
  });

  const result = listings.map((l) => {
    const spec = EQUIPMENT_TYPES[l.equipmentTypeId];
    return {
      id             : l.id,
      equipmentTypeId: l.equipmentTypeId,
      name           : spec?.name        ?? l.equipmentTypeId,
      icon           : spec?.icon        ?? "⚙️",
      workshopType   : spec?.workshopType ?? null,
      maxThroughput  : spec?.maxThroughput ?? 0,
      wearRate       : spec?.wearRate     ?? 0,
      requiredRole   : spec?.requiredProfession ?? null,
      city           : l.city,
      priceGc        : Number(l.priceGc),
      stockQty       : l.stockQty,
      wearPercent    : l.wearPercent,
      expiresAt      : l.expiresAt,
    };
  });

  const payload = { listings: result, total: result.length };
  cache.set(cacheKey, payload, TTL_EQUIPMENT);

  return NextResponse.json(payload);
}
