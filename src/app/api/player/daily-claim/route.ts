import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";

const TICKS_PER_DAY   = 24; // конвенція гри: 1 тік = 1 година
const GRACE_TICKS      = TICKS_PER_DAY * 2; // пропуск ≤ доба зберігає стрік
const BASE_BONUS_UAH   = 2_500;
const MAX_STREAK_MULT  = 7;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [bonus, currentTick] = await Promise.all([
    prisma.dailyLoginBonus.findUnique({ where: { playerId: session.user.id } }),
    prisma.gameTick.findFirst({ orderBy: { tickNumber: "desc" }, select: { tickNumber: true } }),
  ]);
  const tickNumber = currentTick?.tickNumber ?? 0n;
  const lastClaimedTick = bonus?.lastClaimedTick ?? 0n;
  const ticksSinceLast = Number(tickNumber - lastClaimedTick);
  const canClaim = lastClaimedTick === 0n || ticksSinceLast >= TICKS_PER_DAY;

  return NextResponse.json({
    canClaim,
    streakCount: bonus?.streakCount ?? 0,
    ticksUntilNextClaim: canClaim ? 0 : TICKS_PER_DAY - ticksSinceLast,
  });
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const playerId = session.user.id;

  const [bonus, currentTick, player] = await Promise.all([
    prisma.dailyLoginBonus.findUnique({ where: { playerId } }),
    prisma.gameTick.findFirst({ orderBy: { tickNumber: "desc" }, select: { tickNumber: true } }),
    prisma.player.findUnique({ where: { id: playerId }, select: { cashBalance: true } }),
  ]);
  if (!player) return NextResponse.json({ error: "Гравця не знайдено" }, { status: 404 });

  const tickNumber       = currentTick?.tickNumber ?? 0n;
  const lastClaimedTick  = bonus?.lastClaimedTick ?? 0n;
  const ticksSinceLast   = Number(tickNumber - lastClaimedTick);
  const isFirstClaim     = lastClaimedTick === 0n;

  if (!isFirstClaim && ticksSinceLast < TICKS_PER_DAY) {
    return NextResponse.json({
      error: `Наступний бонус буде доступний через ${TICKS_PER_DAY - ticksSinceLast} тіків`,
    }, { status: 400 });
  }

  const prevStreak = bonus?.streakCount ?? 0;
  const newStreak  = (!isFirstClaim && ticksSinceLast <= GRACE_TICKS) ? prevStreak + 1 : 1;
  const bonusUah   = BASE_BONUS_UAH * Math.min(newStreak, MAX_STREAK_MULT);

  const balanceBefore = new Decimal(player.cashBalance.toString());
  const balanceAfter  = balanceBefore.plus(bonusUah);

  await prisma.$transaction([
    prisma.player.update({ where: { id: playerId }, data: { cashBalance: { increment: bonusUah } } }),
    prisma.dailyLoginBonus.upsert({
      where:  { playerId },
      update: { lastClaimedTick: tickNumber, streakCount: newStreak },
      create: { playerId, lastClaimedTick: tickNumber, streakCount: newStreak },
    }),
    prisma.financialTransaction.create({
      data: {
        playerId,
        type:        "DAILY_LOGIN_BONUS",
        amountUah:   new Decimal(bonusUah),
        balanceBefore,
        balanceAfter,
        description: `Щоденний бонус за вхід (стрік ${newStreak})`,
      },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    bonusUah,
    streakCount: newStreak,
    message: `+₴${bonusUah.toLocaleString()} (стрік ${newStreak})`,
  });
}
