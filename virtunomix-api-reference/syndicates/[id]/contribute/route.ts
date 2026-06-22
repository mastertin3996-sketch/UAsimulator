import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeSyndicateLevel } from "@/lib/syndicate-config";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const syndicate = await prisma.syndicate.findUnique({
    where : { id },
    select: { id: true, name: true, balance: true, level: true, ownerId: true },
  });
  if (!syndicate) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const user = await prisma.user.findUnique({
    where : { id: session.user.id },
    select: { syndicateId: true, username: true, wallet: { select: { gameCash: true } } },
  });
  if (user?.syndicateId !== id)
    return NextResponse.json({ error: "Ви не є членом цього синдикату" }, { status: 403 });

  const body   = await req.json() as { amount: number };
  const amount = Number(body.amount);
  if (!amount || amount < 1) return NextResponse.json({ error: "Сума має бути > 0" }, { status: 400 });
  if (Number(user?.wallet?.gameCash ?? 0) < amount)
    return NextResponse.json({ error: "Недостатньо GC" }, { status: 400 });

  const newBalance = Number(syndicate.balance) + amount;
  const newLevel   = computeSyndicateLevel(newBalance);
  const leveledUp  = newLevel > syndicate.level;

  await prisma.$transaction([
    prisma.userWallet.update({
      where: { userId: session.user.id },
      data : { gameCash: { decrement: amount } },
    }),
    prisma.syndicate.update({
      where: { id },
      data : { balance: newBalance, level: newLevel },
    }),
    prisma.syndicateFundContribution.create({
      data: { syndicateId: id, userId: session.user.id, amount },
    }),
    prisma.syndicateActivityLog.create({
      data: { syndicateId: id, userId: session.user.id, type: "CONTRIBUTE",
              message: `@${user?.username} поповнив фонд R&D на ${amount.toLocaleString("uk-UA")} GC`,
              amount },
    }),
    ...(leveledUp ? [prisma.syndicateActivityLog.create({
      data: { syndicateId: id, type: "LEVEL_UP",
              message: `🎉 Синдикат досяг рівня ${newLevel}!` },
    })] : []),
  ]);

  return NextResponse.json({ ok: true, newBalance, newLevel, leveledUp });
}
