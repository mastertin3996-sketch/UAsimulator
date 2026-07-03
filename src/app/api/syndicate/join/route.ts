import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const joinSyndicateSchema = z.object({
  syndicateId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const playerId = session.user.id;

  const rawBody = await req.json().catch(() => null);
  const parsed  = joinSyndicateSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Потрібен syndicateId" }, { status: 400 });
  }
  const body = parsed.data;

  const existing = await prisma.syndicateMember.findUnique({ where: { playerId }, select: { id: true } });
  if (existing) return NextResponse.json({ error: "Ви вже є членом синдикату" }, { status: 400 });

  const syndicate = await prisma.syndicate.findUnique({
    where:  { id: body.syndicateId },
    select: { id: true, maxMembers: true, isPublic: true, _count: { select: { members: true } } },
  });
  if (!syndicate) return NextResponse.json({ error: "Синдикат не знайдено" }, { status: 404 });
  if (!syndicate.isPublic) return NextResponse.json({ error: "Синдикат закритий" }, { status: 403 });
  if (syndicate._count.members >= syndicate.maxMembers) {
    return NextResponse.json({ error: "Синдикат заповнений" }, { status: 400 });
  }

  await prisma.syndicateMember.create({ data: { syndicateId: body.syndicateId, playerId } });
  return NextResponse.json({ ok: true });
}
