import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EnterpriseType } from "@prisma/client";

const CAT: Record<EnterpriseType, string> = {
  OFFICE: "PRODUCTION", AGRO_FARM: "EXTRACTION", TEXTILE_FACTORY: "PRODUCTION",
  FOOD_PROCESSING: "PRODUCTION", RETAIL_STORE: "TRADE", WAREHOUSE: "LOGISTICS",
  LOGISTICS_HUB: "LOGISTICS", RD_LABORATORY: "PRODUCTION",
};

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;

  const players = await prisma.player.findMany({
    where: { isActive: true },
    select: {
      id: true, username: true, companyName: true,
      netWorth: true, cashBalance: true, reputationScore: true,
      creditRating: true, createdAt: true,
      enterprises: {
        select: { id: true, type: true, isOperational: true, isSeized: true },
      },
    },
    orderBy: { netWorth: "desc" },
    take: 100,
  });

  const lastTick = await prisma.gameTick.findFirst({
    orderBy: { tickNumber: "desc" },
    select: { tickNumber: true },
  });

  const buildRow = (p: typeof players[number], rank: number) => {
    const nw      = Number(p.netWorth);
    const cash    = Number(p.cashBalance);
    const rating  = Math.round(p.reputationScore * 10);
    const entList = p.enterprises;
    const active  = entList.filter((e) => e.isOperational && !e.isSeized).length;
    const brand   = Math.min(5, Math.max(1, Math.floor(p.reputationScore / 2)));
    const ownerLv = Math.min(50, Math.max(1, Math.floor(entList.length * 1.5 + p.creditRating)));
    return {
      rank,
      id:               p.id,
      name:             p.companyName,
      slogan:           null,
      rating,
      brandLevel:       brand,
      totalAssets:      nw,
      gameCash:         cash,
      netWorth:         nw,
      ownerUsername:    p.username,
      ownerLevel:       ownerLv,
      isMyCompany:      p.id === playerId,
      enterprises:      entList.length,
      activeEnterprises: active,
      createdAt:        p.createdAt.toISOString(),
    };
  };

  // By rating (reputation)
  const byRating     = [...players].sort((a, b) => b.reputationScore - a.reputationScore).map((p, i) => buildRow(p, i + 1));
  // By wealth
  const byWealth     = [...players].sort((a, b) => Number(b.netWorth) - Number(a.netWorth)).map((p, i) => buildRow(p, i + 1));
  // By enterprises count
  const byEnterprises = [...players].sort((a, b) => b.enterprises.length - a.enterprises.length).map((p, i) => buildRow(p, i + 1));

  const myIdx = byRating.findIndex((r) => r.isMyCompany);

  // My ranks
  const myRanks = myIdx >= 0 ? {
    rating:      byRating.findIndex((r) => r.isMyCompany) + 1,
    wealth:      byWealth.findIndex((r) => r.isMyCompany) + 1,
    enterprises: byEnterprises.findIndex((r) => r.isMyCompany) + 1,
  } : null;

  // Nearby (±5 around me in rating ranking)
  const nearby = myIdx >= 0
    ? byRating.slice(Math.max(0, myIdx - 5), myIdx + 6)
    : byRating.slice(0, 5);

  // Sector leaders
  const CATEGORIES = ["EXTRACTION", "PRODUCTION", "TRADE", "LOGISTICS"];
  const sectorLeaders = CATEGORIES.map((category) => {
    const topMap = new Map<string, { companyId: string; companyName: string; count: number; revenue: number; isMe: boolean }>();
    for (const p of players) {
      const entInCat = p.enterprises.filter((e) => CAT[e.type] === category);
      if (entInCat.length === 0) continue;
      const revenue = entInCat.length * 1000;
      topMap.set(p.id, {
        companyId: p.id, companyName: p.companyName,
        count: entInCat.length, revenue, isMe: p.id === playerId,
      });
    }
    const sorted = Array.from(topMap.values()).sort((a, b) => b.count - a.count || b.revenue - a.revenue).slice(0, 5);
    return { category, topCompanies: sorted };
  });

  // Recent rating awards (last 60 ticks)
  const lastTickNum = lastTick?.tickNumber ?? 0n;
  const recentAwards = await prisma.ratingAward.findMany({
    where:   { tick: { gte: lastTickNum - 60n } },
    include: { player: { select: { username: true, companyName: true } } },
    orderBy: [{ tick: "desc" }, { rank: "asc" }],
    take:    30,
  });

  const awards = recentAwards.map(a => ({
    id:          a.id,
    category:    a.category,
    rank:        a.rank,
    tick:        Number(a.tick),
    playerId:    a.playerId,
    username:    a.player.username,
    companyName: a.player.companyName,
    isMe:        a.playerId === playerId,
  }));

  return NextResponse.json({
    myCompanyId:    playerId,
    companies:      byRating,
    byWealth,
    byEnterprises,
    myRanks,
    nearby,
    sectorLeaders,
    awards,
    totalCompanies: players.length,
    lastTickNumber: lastTick ? Number(lastTick.tickNumber) : null,
  });
}
