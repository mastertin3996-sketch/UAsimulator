import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const VOTE_DURATION_TICKS  = 5n;
const CAMPAIGN_DURATION    = 10n; // тіків після виконання

export class SyndicateVoteService {
  constructor(private readonly db: PrismaClient) {}

  async proposeVote(params: {
    syndicateId: string;
    proposedById: string;
    type: 'AD_CAMPAIGN' | 'INSURANCE_FUND';
    amount: number;
    tickNumber: bigint;
  }): Promise<{ ok: boolean; message: string; voteId?: string }> {
    const syn = await this.db.syndicate.findUnique({
      where:   { id: params.syndicateId },
      include: { members: true },
    });
    if (!syn) return { ok: false, message: 'Синдикат не знайдено' };

    const isMember = syn.members.some(m => m.playerId === params.proposedById);
    const isLeader = syn.leaderId === params.proposedById;
    if (!isMember && !isLeader) return { ok: false, message: 'Ви не є членом синдикату' };

    // Check treasury
    if (Number(syn.treasury) < params.amount) {
      return { ok: false, message: `Недостатньо коштів у скарбниці (є ₴${Number(syn.treasury).toFixed(0)}, потрібно ₴${params.amount})` };
    }

    // Check no open vote of same type
    const existing = await this.db.syndicateVote.findFirst({
      where: { syndicateId: params.syndicateId, type: params.type, status: 'OPEN' },
    });
    if (existing) return { ok: false, message: 'Вже є відкрите голосування цього типу' };

    const vote = await this.db.syndicateVote.create({
      data: {
        syndicateId:   params.syndicateId,
        proposedById:  params.proposedById,
        type:          params.type,
        amount:        new Decimal(params.amount),
        description:   params.type === 'AD_CAMPAIGN'
          ? `Рекламна кампанія ₴${params.amount.toLocaleString('uk-UA')} — +20% NPC попит для членів на 10 тіків`
          : `Страховий резерв ₴${params.amount.toLocaleString('uk-UA')} — захист при банкрутстві`,
        expiresAtTick: params.tickNumber + VOTE_DURATION_TICKS,
        createdAtTick: params.tickNumber,
      },
    });

    // Notify all members
    const notifs = syn.members.map(m => ({
      playerId: m.playerId,
      type:     'MACRO_EVENT' as const,
      title:    'Нове голосування в синдикаті',
      body:     `"${syn.name}": ${vote.description}. Голосуйте протягом 5 тіків.`,
    }));
    await this.db.notification.createMany({ data: notifs }).catch(() => {});

    return { ok: true, message: 'Голосування відкрито', voteId: vote.id };
  }

  async castVote(params: {
    voteId: string;
    playerId: string;
    choice: 'YES' | 'NO';
  }): Promise<{ ok: boolean; message: string }> {
    const vote = await this.db.syndicateVote.findUnique({ where: { id: params.voteId } });
    if (!vote || vote.status !== 'OPEN') return { ok: false, message: 'Голосування закрито або не знайдено' };

    if (vote.votedPlayerIds.includes(params.playerId)) {
      return { ok: false, message: 'Ви вже голосували' };
    }

    const isMember = await this.db.syndicateMember.findFirst({
      where: { syndicateId: vote.syndicateId, playerId: params.playerId },
    });
    if (!isMember) return { ok: false, message: 'Ви не є членом синдикату' };

    await this.db.syndicateVote.update({
      where: { id: params.voteId },
      data:  {
        yesVotes:       params.choice === 'YES' ? { increment: 1 } : undefined,
        noVotes:        params.choice === 'NO'  ? { increment: 1 } : undefined,
        votedPlayerIds: { push: params.playerId },
      },
    });

    return { ok: true, message: `Ваш голос (${params.choice}) враховано` };
  }

  async processExpiredVotes(tickNumber: bigint): Promise<void> {
    const expired = await this.db.syndicateVote.findMany({
      where: { status: 'OPEN', expiresAtTick: { lt: tickNumber } },
      include: { syndicate: { include: { members: true } } },
    });

    for (const vote of expired) {
      const total = vote.yesVotes + vote.noVotes;
      const passed = total > 0 && vote.yesVotes > vote.noVotes;

      if (passed && Number(vote.syndicate.treasury) >= Number(vote.amount)) {
        await this.executeVote(vote, tickNumber);
      } else {
        await this.db.syndicateVote.update({
          where: { id: vote.id },
          data:  { status: 'REJECTED' },
        });
        const notifs = vote.syndicate.members.map(m => ({
          playerId: m.playerId,
          type:     'MACRO_EVENT' as const,
          title:    'Голосування не пройшло',
          body:     `Синдикат "${vote.syndicate.name}": "${vote.description}" — відхилено (${vote.yesVotes} ЗА / ${vote.noVotes} ПРОТИ).`,
        }));
        await this.db.notification.createMany({ data: notifs }).catch(() => {});
      }
    }
  }

  private async executeVote(
    vote: Awaited<ReturnType<typeof this.db.syndicateVote.findFirst>> & {
      syndicate: { members: { playerId: string }[]; name: string; treasury: Decimal };
    },
    tickNumber: bigint,
  ): Promise<void> {
    if (!vote) return;

    const updates: ReturnType<typeof this.db.syndicateVote.update>[] = [
      this.db.syndicateVote.update({
        where: { id: vote.id },
        data:  { status: 'EXECUTED' },
      }),
      this.db.syndicate.update({
        where: { id: vote.syndicateId },
        data:  { treasury: { decrement: vote.amount } },
      }) as any,
    ];

    if (vote.type === 'AD_CAMPAIGN') {
      (updates as any[]).push(
        this.db.syndicate.update({
          where: { id: vote.syndicateId },
          data:  { campaignEndsAtTick: tickNumber + CAMPAIGN_DURATION },
        }),
      );
    }

    await this.db.$transaction(updates as any);

    const notifs = vote.syndicate.members.map(m => ({
      playerId: m.playerId,
      type:     'MACRO_EVENT' as const,
      title:    '✅ Рішення синдикату виконано',
      body:     vote.type === 'AD_CAMPAIGN'
        ? `Рекламна кампанія активована на 10 тіків — +20% NPC попит для всіх членів синдикату!`
        : `Страховий резерв ₴${Number(vote.amount).toFixed(0)} сформовано у скарбниці синдикату.`,
    }));
    await this.db.notification.createMany({ data: notifs }).catch(() => {});
  }
}
