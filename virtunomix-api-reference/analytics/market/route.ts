import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cache, TTL_ANALYTICS } from "@/lib/cache";

// ─── GET /api/analytics/market ────────────────────────────────────────────────
// Returns:
//   • products[]  — per-product stats for the last DONE tick
//   • companies[] — top-50 corporations by net worth (totalAssets + gameCash)
//   • lastTick    — tick metadata

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ── Cache check (expensive aggregation — safe to cache for 60s) ─────────────
  const cacheKey = `analytics:market:${userId}`;
  const hit = cache.get<object>(cacheKey);
  if (hit) return NextResponse.json(hit, { headers: { "X-Cache": "HIT" } });

  // ── Last completed tick ──────────────────────────────────────────────────────
  const lastTick = await prisma.gameTick.findFirst({
    where   : { status: "DONE" },
    orderBy : { tickNumber: "desc" },
    select  : { id: true, tickNumber: true, processedAt: true },
  });

  // ── Products + categories ────────────────────────────────────────────────────
  const products = await prisma.product.findMany({
    select: {
      id: true, name: true, unit: true, icon: true,
      basePrice: true, isRawMaterial: true,
      category: { select: { name: true, icon: true } },
    },
    orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
  });

  // ── Retail aggregation for last tick ────────────────────────────────────────
  const retailAgg = lastTick
    ? await prisma.retailSalesLog.groupBy({
        by      : ["productId"],
        where   : { tickId: lastTick.id },
        _sum    : { quantitySold: true, revenue: true },
        _avg    : { price: true, saturationIndex: true },
      })
    : [];

  // ── Production aggregation for last tick ────────────────────────────────────
  const prodAgg = lastTick
    ? await prisma.productionLog.groupBy({
        by    : ["productId"],
        where : { tickId: lastTick.id },
        _sum  : { quantity: true },
        _avg  : { avgQuality: true },
      })
    : [];

  // ── Wholesale: active market offers (quantity-weighted avg price) ────────────
  const activeOffers = await prisma.marketOffer.groupBy({
    by   : ["productId"],
    where: { status: "ACTIVE" },
    _avg : { price: true },
    _sum : { quantity: true },
  });

  // ── Build lookup maps ────────────────────────────────────────────────────────
  const retailMap  = new Map(retailAgg.map((r) => [r.productId, r]));
  const prodMap    = new Map(prodAgg.map((p) => [p.productId, p]));
  const offerMap   = new Map(activeOffers.map((o) => [o.productId, o]));

  const productRows = products.map((p) => {
    const retail  = retailMap.get(p.id);
    const prod    = prodMap.get(p.id);
    const offer   = offerMap.get(p.id);

    const satIndex = retail ? Number(retail._avg.saturationIndex) : null;
    const status   =
      satIndex === null ? "NO_DATA"
      : satIndex > 1.25 ? "SURPLUS"
      : satIndex < 0.75 ? "DEFICIT"
      : "BALANCED";

    return {
      id           : p.id,
      name         : p.name,
      unit         : p.unit,
      icon         : p.icon,
      basePrice    : Number(p.basePrice),
      isRawMaterial: p.isRawMaterial,
      category     : p.category.name,
      categoryIcon : p.category.icon,
      stats: {
        production       : prod   ? Number(prod._sum.quantity)        : 0,
        avgQuality       : prod   ? Number(prod._avg.avgQuality)      : null,
        retailSold       : retail ? Number(retail._sum.quantitySold)  : 0,
        retailRevenue    : retail ? Number(retail._sum.revenue)       : 0,
        avgRetailPrice   : retail ? Number(retail._avg.price)         : null,
        avgWholesalePrice: offer  ? Number(offer._avg.price)          : null,
        wholesaleStock   : offer  ? Number(offer._sum.quantity)       : 0,
        saturationIndex  : satIndex,
        status,
      },
    };
  });

  // ── My produced product IDs ─────────────────────────────────────────────────
  // Products the current user's workshop lines (with a recipe) output
  const userCompany = await prisma.company.findFirst({
    where : { ownerId: userId },
    select: { id: true },
  });
  let myProductIds: string[] = [];
  if (userCompany) {
    const myLines = await prisma.productionLine.findMany({
      where : {
        workshop: { office: { enterprise: { companyId: userCompany.id } } },
        recipeId: { not: null },
      },
      select: { recipe: { select: { outputProductId: true } } },
    });
    myProductIds = [...new Set(
      myLines.flatMap((ln) => ln.recipe ? [ln.recipe.outputProductId] : []),
    )];
  }

  // ── Total retail revenue for last tick ──────────────────────────────────────
  const totalRetailRevenue = lastTick
    ? await prisma.retailSalesLog.aggregate({
        where : { tickId: lastTick.id },
        _sum  : { revenue: true },
      }).then((r) => Number(r._sum.revenue ?? 0))
    : 0;

  // ── Top corporations by net worth ────────────────────────────────────────────
  const companies = await prisma.company.findMany({
    orderBy: { totalAssets: "desc" },
    take   : 50,
    select : {
      id: true, name: true, rating: true, brandLevel: true, totalAssets: true,
      createdAt: true,
      owner: {
        select: {
          id: true, username: true, level: true,
          wallet: { select: { gameCash: true } },
        },
      },
      _count: { select: { enterprises: { where: { isActive: true } } } },
    },
  });

  const companyRows = companies.map((c, i) => {
    const gameCash  = Number(c.owner.wallet?.gameCash ?? 0);
    const assets    = Number(c.totalAssets);
    const netWorth  = assets + gameCash;
    return {
      rank          : i + 1,
      id            : c.id,
      name          : c.name,
      ownerUsername : c.owner.username,
      ownerLevel    : c.owner.level,
      rating        : Number(c.rating),
      brandLevel    : c.brandLevel,
      totalAssets   : assets,
      gameCash,
      netWorth,
      activeEnterprises: c._count.enterprises,
      createdAt     : c.createdAt,
      isMe          : c.owner.id === userId,
    };
  }).sort((a, b) => b.netWorth - a.netWorth)
    .map((c, i) => ({ ...c, rank: i + 1 }));

  const body = {
    lastTick : lastTick
      ? { tickNumber: lastTick.tickNumber, processedAt: lastTick.processedAt }
      : null,
    products          : productRows,
    companies         : companyRows,
    myProductIds,
    totalRetailRevenue,
  };

  cache.set(cacheKey, body, TTL_ANALYTICS);
  return NextResponse.json(body, { headers: { "X-Cache": "MISS" } });
}
