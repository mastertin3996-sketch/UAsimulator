import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cache, TTL_ANALYTICS } from "@/lib/cache";

// ─── GET /api/ratings ─────────────────────────────────────────────────────────
// Returns:
//   • companies[]      — top-50 by rating
//   • byWealth[]       — top-20 by (totalAssets + gameCash)
//   • sectorLeaders[]  — per category: top-5 by active enterprise count + revenue
//   • myRanks          — my position in each ranking
//   • nearby[]         — 3 companies above + 3 below me in rating ranking

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cacheKey = `ratings:${session.user.id}`;
  const hit = cache.get<object>(cacheKey);
  if (hit) return NextResponse.json(hit, { headers: { "X-Cache": "HIT" } });

  // ── All companies ────────────────────────────────────────────────────────────
  const allCompanies = await prisma.company.findMany({
    select: {
      id: true, name: true, slogan: true,
      rating: true, brandLevel: true, totalAssets: true, createdAt: true,
      owner: {
        select: {
          id: true, username: true, level: true,
          wallet: { select: { gameCash: true } },
        },
      },
      enterprises: {
        select: { id: true, isActive: true, enterpriseType: { select: { category: true } } },
      },
    },
  });

  const userId = session.user.id;
  const myRaw  = allCompanies.find((c) => c.owner.id === userId);

  // ── Top 50 by rating ─────────────────────────────────────────────────────────
  const byRating = [...allCompanies]
    .sort((a, b) => Number(b.rating) - Number(a.rating))
    .slice(0, 50);

  function toRow(c: typeof allCompanies[0], rank: number) {
    const gameCash = Number(c.owner.wallet?.gameCash ?? 0);
    const assets   = Number(c.totalAssets);
    return {
      rank,
      id            : c.id,
      name          : c.name,
      slogan        : c.slogan,
      rating        : Number(c.rating),
      brandLevel    : c.brandLevel,
      totalAssets   : assets,
      gameCash,
      netWorth      : assets + gameCash,
      ownerUsername : c.owner.username,
      ownerLevel    : c.owner.level,
      isMyCompany   : c.owner.id === userId,
      enterprises   : c.enterprises.length,
      activeEnterprises: c.enterprises.filter((e) => e.isActive).length,
      createdAt     : c.createdAt,
    };
  }

  const companies = byRating.map((c, i) => toRow(c, i + 1));

  // ── Top 20 by net worth ───────────────────────────────────────────────────────
  const byWealth = [...allCompanies]
    .sort((a, b) => {
      const wa = Number(a.totalAssets) + Number(a.owner.wallet?.gameCash ?? 0);
      const wb = Number(b.totalAssets) + Number(b.owner.wallet?.gameCash ?? 0);
      return wb - wa;
    })
    .slice(0, 20)
    .map((c, i) => toRow(c, i + 1));

  // ── Top 20 by active enterprises ─────────────────────────────────────────────
  const byEnterprises = [...allCompanies]
    .sort((a, b) => b.enterprises.filter((e) => e.isActive).length - a.enterprises.filter((e) => e.isActive).length)
    .slice(0, 20)
    .map((c, i) => toRow(c, i + 1));

  // ── My ranks in all categories ───────────────────────────────────────────────
  let myRanks: { rating: number; wealth: number; enterprises: number } | null = null;
  if (myRaw) {
    const myWorth = Number(myRaw.totalAssets) + Number(myRaw.owner.wallet?.gameCash ?? 0);
    const myActive = myRaw.enterprises.filter((e) => e.isActive).length;

    const ratingRank      = allCompanies.filter((c) => Number(c.rating) > Number(myRaw.rating)).length + 1;
    const wealthRank      = allCompanies.filter((c) => {
      const w = Number(c.totalAssets) + Number(c.owner.wallet?.gameCash ?? 0);
      return w > myWorth;
    }).length + 1;
    const enterprisesRank = allCompanies.filter((c) => c.enterprises.filter((e) => e.isActive).length > myActive).length + 1;

    myRanks = { rating: ratingRank, wealth: wealthRank, enterprises: enterprisesRank };
  }

  // ── Nearby (±4 in rating ranking) ────────────────────────────────────────────
  let nearby: ReturnType<typeof toRow>[] = [];
  if (myRaw && myRanks) {
    const fullByRating = [...allCompanies]
      .sort((a, b) => Number(b.rating) - Number(a.rating));
    const myIdx = fullByRating.findIndex((c) => c.owner.id === userId);
    if (myIdx >= 0) {
      const start = Math.max(0, myIdx - 4);
      const end   = Math.min(fullByRating.length, myIdx + 5);
      nearby = fullByRating.slice(start, end).map((c, i) => toRow(c, start + i + 1));
    }
  }

  // ── Sector leaders ────────────────────────────────────────────────────────────
  // For each enterprise category, find top-5 companies by active enterprise count.
  // Augment with last-tick retail revenue.
  const lastTick = await prisma.gameTick.findFirst({
    where  : { status: "DONE" },
    orderBy: { tickNumber: "desc" },
    select : { id: true, tickNumber: true },
  });

  // Revenue by enterprise for last tick
  const lastTickRevByEnt = lastTick
    ? await prisma.retailSalesLog.groupBy({
        by   : ["enterpriseId"],
        where: { tickId: lastTick.id },
        _sum : { revenue: true },
      })
    : [];
  const revByEnt = new Map(lastTickRevByEnt.map((r) => [r.enterpriseId, Number(r._sum.revenue ?? 0)]));

  const CATEGORIES = ["EXTRACTION", "PRODUCTION", "TRADE", "LOGISTICS"] as const;

  const sectorLeaders = CATEGORIES.map((cat) => {
    // Per company: count active enterprises in this category + sum revenue
    const companyMap = new Map<string, { companyId: string; companyName: string; count: number; revenue: number; isMe: boolean }>();

    for (const c of allCompanies) {
      const catsEnts = c.enterprises.filter((e) => e.isActive && e.enterpriseType.category === cat);
      if (catsEnts.length === 0) continue;
      const revenue = catsEnts.reduce((s, e) => s + (revByEnt.get(e.id) ?? 0), 0);
      companyMap.set(c.id, {
        companyId  : c.id,
        companyName: c.name,
        count      : catsEnts.length,
        revenue,
        isMe       : c.owner.id === userId,
      });
    }

    const topCompanies = Array.from(companyMap.values())
      .sort((a, b) => b.count - a.count || b.revenue - a.revenue)
      .slice(0, 5);

    return { category: cat, topCompanies };
  });

  const body = {
    myCompanyId: myRaw?.id ?? null,
    companies,
    byWealth,
    byEnterprises,
    myRanks,
    nearby,
    sectorLeaders,
    totalCompanies: allCompanies.length,
    lastTickNumber: lastTick?.tickNumber ?? null,
  };

  cache.set(cacheKey, body, TTL_ANALYTICS);
  return NextResponse.json(body, { headers: { "X-Cache": "MISS" } });
}
