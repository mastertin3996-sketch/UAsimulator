import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SyndicateVoteService } from "@/engine/SyndicateVoteService";

const svc = new SyndicateVoteService(prisma);

// GET — list votes for player's syndicate
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const member = await prisma.syndicateMember.findUnique({
    where:   { playerId: session.user.id },
    select:  { syndicateId: true },
  });
  if (!member) return NextResponse.json({ votes: [] });

  const votes = await prisma.syndicateVote.findMany({
    where:   { syndicateId: member.syndicateId },
    orderBy: { createdAt: "desc" },
    take:    20,
    select: {
      id: true, type: true, description: true, status: true,
      yesVotes: true, noVotes: true, votedPlayerIds: true,
      amount: true, expiresAtTick: true, createdAtTick: true,
    },
  });

  const syndicate = await prisma.syndicate.findUnique({
    where:  { id: member.syndicateId },
    select: { treasury: true, campaignEndsAtTick: true },
  });

  return NextResponse.json({
    votes: votes.map(v => ({
      ...v,
      amount:         Number(v.amount),
      expiresAtTick:  Number(v.expiresAtTick),
      createdAtTick:  Number(v.createdAtTick),
      hasVoted:       v.votedPlayerIds.includes(session.user!.id!),
    })),
    treasury:           Number(syndicate?.treasury ?? 0),
    campaignEndsAtTick: syndicate?.campaignEndsAtTick ? Number(syndicate.campaignEndsAtTick) : null,
    syndicateId:        member.syndicateId,
  });
}

// POST — propose a vote
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as {
    type?: "AD_CAMPAIGN" | "INSURANCE_FUND";
    amount?: number;
  };
  if (!body.type || !body.amount || body.amount <= 0) {
    return NextResponse.json({ error: "type і amount обов'язкові" }, { status: 400 });
  }

  const member = await prisma.syndicateMember.findUnique({ where: { playerId: session.user.id } });
  if (!member) return NextResponse.json({ error: "Ви не є членом синдикату" }, { status: 403 });

  const tick = await prisma.gameTick.findFirst({ orderBy: { tickNumber: "desc" }, select: { tickNumber: true } });
  const result = await svc.proposeVote({
    syndicateId:  member.syndicateId,
    proposedById: session.user.id,
    type:         body.type,
    amount:       body.amount,
    tickNumber:   tick?.tickNumber ?? 0n,
  });

  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 422 });
  return NextResponse.json({ ok: true, voteId: result.voteId, message: result.message });
}
