import { PrismaClient } from '@prisma/client';

export interface AchievementDef {
  code:        string;
  title:       string;
  description: string;
}

interface PlayerContext {
  netWorth:        number;
  creditRating:    number;
  enterpriseCount: number;
  hasLicense:      boolean;
  hasPaidOffLoan:  boolean;
  hasMaDeal:       boolean;
  inSyndicate:     boolean;
  reachedTopTen:   boolean;
}

// Каталог досягнень: код + текст. Умова розблокування — у CHECKS нижче.
// UI (/api/achievements) читає лише цей масив, без залежності від Prisma.
export const ACHIEVEMENT_CATALOG: AchievementDef[] = [
  { code: 'FIRST_ENTERPRISE', title: 'Перший крок',         description: 'Заснуйте перше підприємство' },
  { code: 'FIRST_MILLION',    title: 'Перший мільйон',       description: 'Досягніть чистих активів ₴1 000 000' },
  { code: 'TEN_MILLION',      title: 'Мільйонер+',           description: 'Досягніть чистих активів ₴10 000 000' },
  { code: 'EMPIRE_BUILDER',   title: 'Імперія',              description: 'Володійте 10 підприємствами одночасно' },
  { code: 'FIRST_LICENSE',    title: 'За законом',           description: 'Отримайте першу ліцензію' },
  { code: 'LOAN_PAID_OFF',    title: 'Без боргів',           description: 'Повністю погасіть кредит' },
  { code: 'FIRST_MA_DEAL',    title: 'Угода M&A',            description: 'Завершіть першу угоду з купівлі/продажу підприємства' },
  { code: 'SYNDICATE_MEMBER', title: 'Разом сильніші',       description: 'Вступіть до синдикату' },
  { code: 'CREDIT_MASTER',    title: 'Бездоганна репутація',  description: 'Досягніть кредитного рейтингу 9.5+' },
  { code: 'TOP_TEN_RATING',   title: 'Топ-10',               description: 'Увійдіть у топ-10 загального рейтингу' },
];

const CHECKS: Array<{ code: string; check: (ctx: PlayerContext) => boolean }> = [
  { code: 'FIRST_ENTERPRISE', check: ctx => ctx.enterpriseCount >= 1 },
  { code: 'FIRST_MILLION',    check: ctx => ctx.netWorth >= 1_000_000 },
  { code: 'TEN_MILLION',      check: ctx => ctx.netWorth >= 10_000_000 },
  { code: 'EMPIRE_BUILDER',   check: ctx => ctx.enterpriseCount >= 10 },
  { code: 'FIRST_LICENSE',    check: ctx => ctx.hasLicense },
  { code: 'LOAN_PAID_OFF',    check: ctx => ctx.hasPaidOffLoan },
  { code: 'FIRST_MA_DEAL',    check: ctx => ctx.hasMaDeal },
  { code: 'SYNDICATE_MEMBER', check: ctx => ctx.inSyndicate },
  { code: 'CREDIT_MASTER',    check: ctx => ctx.creditRating >= 9.5 },
  { code: 'TOP_TEN_RATING',   check: ctx => ctx.reachedTopTen },
];

export class AchievementService {
  constructor(private readonly db: PrismaClient) {}

  /** Перевіряє всі умови досягнень для активних гравців і нараховує нові. Викликається періодично з TickEngine. */
  async processAchievements(tickNumber: bigint): Promise<number> {
    const players = await this.db.player.findMany({
      where:  { isNpcSeller: false },
      select: { id: true, netWorth: true, creditRating: true },
    });
    if (players.length === 0) return 0;
    const playerIds = players.map(p => p.id);

    const [
      alreadyUnlocked,
      enterprises,
      licenses,
      paidOffLoans,
      maDeals,
      syndicateMembers,
      topTenAwards,
    ] = await Promise.all([
      this.db.achievement.findMany({ where: { playerId: { in: playerIds } }, select: { playerId: true, code: true } }),
      this.db.enterprise.findMany({ where: { playerId: { in: playerIds } }, select: { playerId: true } }),
      this.db.license.findMany({ where: { playerId: { in: playerIds } }, select: { playerId: true } }),
      this.db.loan.findMany({ where: { playerId: { in: playerIds }, status: 'PAID_OFF' }, select: { playerId: true } }),
      this.db.maDeal.findMany({
        where:  { status: 'COMPLETED', OR: [{ buyerId: { in: playerIds } }, { sellerId: { in: playerIds } }] },
        select: { buyerId: true, sellerId: true },
      }),
      this.db.syndicateMember.findMany({ where: { playerId: { in: playerIds } }, select: { playerId: true } }),
      this.db.ratingAward.findMany({ where: { playerId: { in: playerIds }, rank: { lte: 10 } }, select: { playerId: true } }),
    ]);

    const unlockedByPlayer = new Map<string, Set<string>>();
    for (const a of alreadyUnlocked) {
      if (!unlockedByPlayer.has(a.playerId)) unlockedByPlayer.set(a.playerId, new Set());
      unlockedByPlayer.get(a.playerId)!.add(a.code);
    }

    const countBy = (rows: Array<{ playerId: string }>) => {
      const m = new Map<string, number>();
      for (const r of rows) m.set(r.playerId, (m.get(r.playerId) ?? 0) + 1);
      return m;
    };
    const enterpriseCounts = countBy(enterprises);
    const licenseSet       = new Set(licenses.map(l => l.playerId));
    const paidOffSet       = new Set(paidOffLoans.map(l => l.playerId));
    const maDealSet        = new Set([...maDeals.map(d => d.buyerId), ...maDeals.map(d => d.sellerId)].filter(Boolean) as string[]);
    const syndicateSet     = new Set(syndicateMembers.map(s => s.playerId));
    const topTenSet        = new Set(topTenAwards.map(a => a.playerId));

    let unlockedCount = 0;
    for (const p of players) {
      const unlocked = unlockedByPlayer.get(p.id) ?? new Set<string>();
      const ctx: PlayerContext = {
        netWorth:        Number(p.netWorth),
        creditRating:    p.creditRating,
        enterpriseCount: enterpriseCounts.get(p.id) ?? 0,
        hasLicense:      licenseSet.has(p.id),
        hasPaidOffLoan:  paidOffSet.has(p.id),
        hasMaDeal:       maDealSet.has(p.id),
        inSyndicate:     syndicateSet.has(p.id),
        reachedTopTen:   topTenSet.has(p.id),
      };

      for (const { code, check } of CHECKS) {
        if (unlocked.has(code) || !check(ctx)) continue;
        const def = ACHIEVEMENT_CATALOG.find(d => d.code === code)!;
        await this.db.$transaction([
          this.db.achievement.create({ data: { playerId: p.id, code, unlockedAtTick: tickNumber } }),
          this.db.notification.create({
            data: {
              playerId: p.id,
              type:     'ACHIEVEMENT',
              title:    `🏅 Досягнення: ${def.title}`,
              body:     def.description,
            },
          }),
        ]);
        unlockedCount++;
      }
    }

    return unlockedCount;
  }
}
