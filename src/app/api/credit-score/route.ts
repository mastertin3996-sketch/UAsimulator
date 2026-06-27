/**
 * GET /api/credit-score
 * Повертає creditScore, tier, модифікатор ставки, чи гравець у whitelist.
 * Також повертає останні 10 RegulatoryInspection.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CreditScoreService } from "@/engine/CreditScoreService";

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const player = await prisma.player.findUnique({
    where:  { id: session.user.id },
    select: { creditScore: true, creditRating: true },
  });
  const score = player?.creditScore ?? 500;
  const loanRateMod = CreditScoreService.loanRateModifier(score);
  const whitelisted = CreditScoreService.isWhitelisted(score);

  let tier: string;
  if (score >= 800) tier = "Відмінний";
  else if (score >= 600) tier = "Добрий";
  else if (score >= 400) tier = "Задовільний";
  else if (score >= 200) tier = "Поганий";
  else tier = "Критичний";

  const inspections = await prisma.regulatoryInspection.findMany({
    where:   { playerId: session.user.id },
    orderBy: { conductedAtTick: "desc" },
    take: 10,
    select: {
      id: true, inspectionType: true, result: true, fineUah: true,
      freezeTicks: true, findings: true, conductedAtTick: true, isPaid: true,
      enterprise: { select: { name: true } },
    },
  });

  return NextResponse.json({
    creditScore:  score,
    tier,
    loanRateMod,
    whitelisted,
    creditRating: player?.creditRating ?? 7.0,
    inspections: inspections.map(i => ({
      ...i,
      fineUah:         Number(i.fineUah),
      conductedAtTick: i.conductedAtTick.toString(),
      enterpriseName:  i.enterprise?.name ?? null,
    })),
  });
}
