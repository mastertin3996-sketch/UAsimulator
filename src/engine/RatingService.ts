import { PrismaClient } from '@prisma/client';

const REPUTATION_BONUS = 0.5;

export class RatingService {
  constructor(private readonly db: PrismaClient) {}

  async processAwards(tickNumber: bigint): Promise<number> {
    const players = await this.db.player.findMany({
      where:  { isNpcSeller: false },
      select: { id: true, username: true, reputationScore: true },
    });
    if (players.length === 0) return 0;

    const playerIds = players.map(p => p.id);

    // ── GRAIN_PRODUCER: кількість зерна в інвентарі AGRO_FARM підприємств ──────
    const grainSkus  = ['RM-WHEAT', 'RM-CORN', 'RM-SUNFL', 'RM-SUGBEET'];
    const grainProds = await this.db.product.findMany({
      where:  { sku: { in: grainSkus } },
      select: { id: true },
    });
    const grainIds   = grainProds.map(p => p.id);

    const grainAgg = await this.db.enterpriseInventory.groupBy({
      by:     ['enterprise'],
      where: {
        productId:  { in: grainIds },
        enterprise: { playerId: { in: playerIds }, type: 'AGRO_FARM' },
      },
      _sum: { quantity: true },
    } as any);

    // Groupby on relation needs workaround: aggregate per enterprise then sum per player
    const grainEnts = await this.db.enterpriseInventory.findMany({
      where: { productId: { in: grainIds }, enterprise: { playerId: { in: playerIds }, type: 'AGRO_FARM' } },
      select: { enterprise: { select: { playerId: true } }, quantity: true },
    });
    const grainByPlayer = new Map<string, number>();
    for (const row of grainEnts) {
      const pid = row.enterprise.playerId;
      grainByPlayer.set(pid, (grainByPlayer.get(pid) ?? 0) + Number(row.quantity));
    }

    // ── RETAIL_KING: кількість активних роздрібних лістингів ─────────────────
    const retailRows = await this.db.retailListing.groupBy({
      by:     ['enterpriseId'],
      where:  { isActive: true, enterprise: { playerId: { in: playerIds } } },
      _count: { id: true },
    });
    const entPlayerMap = new Map<string, string>();
    const ents = await this.db.enterprise.findMany({
      where:  { playerId: { in: playerIds } },
      select: { id: true, playerId: true },
    });
    for (const e of ents) entPlayerMap.set(e.id, e.playerId);
    const retailByPlayer = new Map<string, number>();
    for (const row of retailRows) {
      const pid = entPlayerMap.get(row.enterpriseId);
      if (pid) retailByPlayer.set(pid, (retailByPlayer.get(pid) ?? 0) + row._count.id);
    }

    // ── TENDER_CHAMPION: виконані тендери за останні 30 тіків ────────────────
    const since = tickNumber - 30n;
    const tenderRows = await this.db.tender.groupBy({
      by:     ['winnerId'],
      where:  { status: 'FULFILLED', createdAtTick: { gte: since }, winnerId: { in: playerIds } },
      _count: { id: true },
    });
    const tenderByPlayer = new Map<string, number>();
    for (const row of tenderRows) {
      if (row.winnerId) tenderByPlayer.set(row.winnerId, row._count.id);
    }

    const rank3 = (map: Map<string, number>, ids: string[]) =>
      ids
        .map(id => ({ id, score: map.get(id) ?? 0 }))
        .sort((a, b) => b.score - a.score)
        .filter(x => x.score > 0)
        .slice(0, 3);

    const grainTop   = rank3(grainByPlayer,  playerIds);
    const retailTop  = rank3(retailByPlayer, playerIds);
    const tenderTop  = rank3(tenderByPlayer, playerIds);

    const categories: Array<{ cat: 'GRAIN_PRODUCER' | 'RETAIL_KING' | 'TENDER_CHAMPION'; top: typeof grainTop }> = [
      { cat: 'GRAIN_PRODUCER',   top: grainTop  },
      { cat: 'RETAIL_KING',      top: retailTop },
      { cat: 'TENDER_CHAMPION',  top: tenderTop },
    ];

    let awarded = 0;
    for (const { cat, top } of categories) {
      for (let i = 0; i < top.length; i++) {
        const { id: playerId } = top[i];
        await this.db.$transaction([
          this.db.ratingAward.create({
            data: { playerId, category: cat, rank: i + 1, tick: tickNumber },
          }),
          this.db.player.update({
            where: { id: playerId },
            data:  { reputationScore: { increment: REPUTATION_BONUS } },
          }),
          this.db.notification.create({
            data: {
              playerId,
              type:  'MACRO_EVENT',
              title: `🏆 Рейтинг: ${i + 1}-е місце`,
              body:  `${categoryLabel(cat)}: ${i + 1}-е місце! +${REPUTATION_BONUS} до репутації.`,
            },
          }),
        ]);
        awarded++;
      }
    }

    return awarded;
  }
}

function categoryLabel(cat: string): string {
  if (cat === 'GRAIN_PRODUCER')  return 'Найбільший аграрій';
  if (cat === 'RETAIL_KING')     return 'Король роздрібу';
  if (cat === 'TENDER_CHAMPION') return 'Тендерний чемпіон';
  return cat;
}
