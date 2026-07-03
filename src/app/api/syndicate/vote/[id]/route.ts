import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SyndicateVoteService } from "@/engine/SyndicateVoteService";

const svc = new SyndicateVoteService(prisma);

const castVoteSchema = z.object({
  choice: z.enum(["YES", "NO"]),
});

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: voteId } = await params;
  const rawBody = await req.json().catch(() => null);
  const parsed  = castVoteSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "choice має бути YES або NO" }, { status: 400 });
  }
  const body = parsed.data;

  const result = await svc.castVote({ voteId, playerId: session.user.id, choice: body.choice });
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 422 });
  return NextResponse.json({ ok: true, message: result.message });
}
