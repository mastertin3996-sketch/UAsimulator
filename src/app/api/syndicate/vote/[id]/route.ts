import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SyndicateVoteService } from "@/engine/SyndicateVoteService";

const svc = new SyndicateVoteService(prisma);

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: voteId } = await params;
  const body = await req.json().catch(() => ({})) as { choice?: "YES" | "NO" };
  if (body.choice !== "YES" && body.choice !== "NO") {
    return NextResponse.json({ error: "choice має бути YES або NO" }, { status: 400 });
  }

  const result = await svc.castVote({ voteId, playerId: session.user.id, choice: body.choice });
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 422 });
  return NextResponse.json({ ok: true, message: result.message });
}
