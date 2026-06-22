import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cache, TTL_ANALYTICS } from "@/lib/cache";

// ─── GET /api/analytics/trends ────────────────────────────────────────────────
// Returns:
//   • priceMovers[]   — products with biggest retail price change (oldest→newest of last 10 ticks)
//   • categoryStats[] — per-category saturation summary
//   • topWholesalers[]— top companies by active B2B offer volume
//   • marketSummary   — global active-offer stats

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cacheKey = `analytics:trends`;
  const hit = cache.get<object>(cacheKey);
  if (hit) return NextResponse.json(hit, { headers: { "X-Cache": "HIT" } });

  // ── Last 10 completed ticks ──────────────────────────────────────────────────
  const ticks = await prisma.gameTick.findMany({
    where  : { status: "DONE" },
    orderBy: { tickNumber: "desc" },
    take   : 10,
    select : { id: true, tickNumber: true },
  });

  const tickIds    = ticks.map((t) => t.id);
  const newestTick = ticks[0] ?? null;
  const oldestTick = ticks[ticks.length - 1] ?? null;

  // ── Products with category info ──────────────────────────────────────────────
  const products = await prisma.product.findMany({
    select: {
      id: true, name: true, icon: true, unit: true, basePrice: true,
      category: { select: { name: true } },
    },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  // ── Retail aggregation for all last-10 ticks ─────────────────────────────────
  const retailByTickProduct = tickIds.length > 0
    ? await prisma.retailSalesLog.groupBy({
        by   : ["productId", "tickId"],
        where: { tickId: { in: tickIds } },
        _avg : { price: true, saturationIndex: true },
        _sum : { quantitySold: true },
      })
    : [];

  // Production aggregation for last 10 ticks
  const prodByTickProduct = tickIds.length > 0
    ? await prisma.productionLog.groupBy({
        by   : ["productId", "tickId"],
        where: { tickId: { in: tickIds } },
        _sum : { quantity: true },
      })
    : [];

  // Build nested maps: productId → tickId → data
  type RetailAgg = { price: number | null; qty: number; saturation: number | null };
  const retailMap = new Map<string, Map<string, RetailAgg>>();
  for (const r of retailByTickProduct) {
    if (!retailMap.has(r.productId)) retailMap.set(r.productId, new Map());
    retailMap.get(r.productId)!.set(r.tickId, {
      price     : r._avg.price      != null ? Number(r._avg.price)            : null,
      qty       : Number(r._sum.quantitySold ?? 0),
      saturation: r._avg.saturationIndex != null ? Number(r._avg.saturationIndex) : null,
    });
  }

  const prodMap = new Map<string, Map<string, number>>();
  for (const p of prodByTickProduct) {
    if (!prodMap.has(p.productId)) prodMap.set(p.productId, new Map());
    prodMap.get(p.productId)!.set(p.tickId, Number(p._sum.quantity ?? 0));
  }

  // ── Price movers: compare oldest tick vs newest tick ──────────────────────────
  type PriceMover = {
    id       : string;
    name     : string;
    icon     : string | null;
    unit     : string;
    basePrice: number;
    category : string;
    priceOld : number | null;
    priceNew : number | null;
    changePct: number | null;
    avgSaturation: number | null;
    status   : "SURPLUS" | "DEFICIT" | "BALANCED" | "NO_DATA";
  };

  const movers: PriceMover[] = [];

  for (const prod of products) {
    const tickData = retailMap.get(prod.id);
    if (!tickData) continue;

    const newEntry = newestTick ? tickData.get(newestTick.id) : null;
    const oldEntry = oldestTick ? tickData.get(oldestTick.id) : null;

    const priceNew = newEntry?.price ?? null;
    const priceOld = oldEntry?.price ?? null;

    let changePct: number | null = null;
    if (priceNew !== null && priceOld !== null && priceOld > 0) {
      changePct = ((priceNew - priceOld) / priceOld) * 100;
    }

    // Avg saturation across all ticks in window
    const satValues = Array.from(tickData.values())
      .map((d) => d.saturation)
      .filter((s): s is number => s !== null);
    const avgSaturation = satValues.length > 0
      ? satValues.reduce((a, b) => a + b, 0) / satValues.length
      : null;

    const status =
      avgSaturation === null ? "NO_DATA"
      : avgSaturation > 1.25  ? "SURPLUS"
      : avgSaturation < 0.75  ? "DEFICIT"
      : "BALANCED";

    movers.push({
      id: prod.id, name: prod.name, icon: prod.icon, unit: prod.unit,
      basePrice: Number(prod.basePrice), category: prod.category.name,
      priceOld, priceNew, changePct, avgSaturation, status,
    });
  }

  // Sort: biggest |changePct| first (products with actual price data in both ticks)
  const withChange = movers.filter((m) => m.changePct !== null);
  withChange.sort((a, b) => Math.abs(b.changePct!) - Math.abs(a.changePct!));
  const topRisers = withChange.filter((m) => (m.changePct ?? 0) > 0).slice(0, 6);
  const topFallers = withChange.filter((m) => (m.changePct ?? 0) < 0).slice(0, 6);

  // ── Category stats ────────────────────────────────────────────────────────────
  type CatStat = {
    category      : string;
    productCount  : number;
    activeProducts: number;
    avgSaturation : number | null;
    totalProduction : number;
    totalRetailSold : number;
    deficitCount  : number;
    surplusCount  : number;
  };
  const catMap = new Map<string, CatStat>();

  for (const prod of products) {
    const cat = prod.category.name;
    if (!catMap.has(cat)) {
      catMap.set(cat, {
        category: cat, productCount: 0, activeProducts: 0,
        avgSaturation: null, totalProduction: 0, totalRetailSold: 0,
        deficitCount: 0, surplusCount: 0,
      });
    }
    const entry = catMap.get(cat)!;
    entry.productCount++;

    // Accumulate production across all ticks
    const prodTicks = prodMap.get(prod.id);
    if (prodTicks) {
      for (const qty of prodTicks.values()) entry.totalProduction += qty;
    }

    // Find mover for this product (already computed)
    const mover = movers.find((m) => m.id === prod.id);
    if (mover && mover.avgSaturation !== null) {
      entry.activeProducts++;
      const existing = entry.avgSaturation ?? 0;
      entry.avgSaturation = existing === 0 && entry.activeProducts === 1
        ? mover.avgSaturation
        : ((existing * (entry.activeProducts - 1)) + mover.avgSaturation) / entry.activeProducts;
      if (mover.status === "DEFICIT")  entry.deficitCount++;
      if (mover.status === "SURPLUS")  entry.surplusCount++;
    }

    // Sum retail sold for newest tick
    const retailTicks = retailMap.get(prod.id);
    if (retailTicks && newestTick) {
      const newData = retailTicks.get(newestTick.id);
      if (newData) entry.totalRetailSold += newData.qty;
    }
  }

  const categoryStats = Array.from(catMap.values())
    .sort((a, b) => b.totalRetailSold - a.totalRetailSold);

  // ── Top wholesalers by active B2B offers ──────────────────────────────────────
  const userCompany = await prisma.company.findFirst({
    where: { ownerId: session.user.id },
    select: { id: true },
  });

  const activeOffersGrouped = await prisma.marketOffer.groupBy({
    by   : ["sellerCompanyId"],
    where: { status: "ACTIVE" },
    _sum : { quantity: true },
    _count: { id: true },
    orderBy: { _sum: { quantity: "desc" } },
    take : 10,
  });

  const wholesalerIds = activeOffersGrouped.map((o) => o.sellerCompanyId);
  const wholesalerNames = await prisma.company.findMany({
    where : { id: { in: wholesalerIds } },
    select: { id: true, name: true },
  });
  const nameMap = new Map(wholesalerNames.map((c) => [c.id, c.name]));

  // Revenue estimate from MarketTransactions (last 30 ticks worth, all for active sellers)
  const txnRevByCompany = await prisma.marketTransaction.groupBy({
    by   : ["sellerCompanyId"],
    where: { sellerCompanyId: { in: wholesalerIds } },
    _sum : { totalPrice: true },
    _count: { id: true },
  });
  const txnRevMap = new Map(txnRevByCompany.map((t) => [t.sellerCompanyId, Number(t._sum.totalPrice ?? 0)]));

  const topWholesalers = activeOffersGrouped.map((o) => ({
    companyName : nameMap.get(o.sellerCompanyId) ?? "—",
    offerCount  : o._count.id,
    totalQty    : Number(o._sum.quantity ?? 0),
    totalRevenue: txnRevMap.get(o.sellerCompanyId) ?? 0,
    isMe        : o.sellerCompanyId === userCompany?.id,
  }));

  // ── Market summary ────────────────────────────────────────────────────────────
  const [totalActiveOffers, totalQtyStat] = await Promise.all([
    prisma.marketOffer.count({ where: { status: "ACTIVE" } }),
    prisma.marketOffer.aggregate({
      where: { status: "ACTIVE" },
      _sum : { quantity: true },
      _count: { sellerCompanyId: true },
    }),
  ]);

  const body = {
    tickWindow   : { oldest: oldestTick?.tickNumber ?? null, newest: newestTick?.tickNumber ?? null },
    topRisers,
    topFallers,
    categoryStats,
    topWholesalers,
    marketSummary: {
      totalActiveOffers,
      totalQtyForSale     : Number(totalQtyStat._sum.quantity ?? 0),
      totalActiveCompanies: totalQtyStat._count.sellerCompanyId,
    },
  };

  cache.set(cacheKey, body, TTL_ANALYTICS);
  return NextResponse.json(body, { headers: { "X-Cache": "MISS" } });
}
