import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const playerId = session.user.id;

  const [syndicates, myMembership] = await Promise.all([
    prisma.syndicate.findMany({
      where:   { isPublic: true },
      orderBy: { createdAt: "desc" },
      include: {
        leader:  { select: { username: true, companyName: true } },
        members: { select: { id: true, role: true, player: { select: { username: true, companyName: true, netWorth: true } } } },
      },
    }),
    prisma.syndicateMember.findUnique({
      where:   { playerId },
      include: { syndicate: { include: { leader: { select: { username: true } }, members: { include: { player: { select: { username: true, companyName: true, netWorth: true } } } } } } },
    }),
  ]);

  return NextResponse.json({
    syndicates: syndicates.map((s) => ({
      id:          s.id,
      name:        s.name,
      description: s.description,
      leaderId:    s.leaderId,
      leaderName:  s.leader.username,
      leaderCompany: s.leader.companyName,
      memberCount: s.members.length,
      maxMembers:  s.maxMembers,
      isPublic:    s.isPublic,
      treasury:    Number(s.treasury),
      createdAt:   s.createdAt.toISOString(),
    })),
    mySyndicate: myMembership ? {
      id:          myMembership.syndicate.id,
      name:        myMembership.syndicate.name,
      description: myMembership.syndicate.description,
      role:        myMembership.role,
      isLeader:    myMembership.syndicate.leaderId === playerId,
      treasury:    Number(myMembership.syndicate.treasury),
      members:     myMembership.syndicate.members.map((m) => ({
        id:          m.id,
        username:    m.player.username,
        companyName: m.player.companyName,
        netWorth:    Number(m.player.netWorth),
        role:        m.role,
      })),
    } : null,
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const playerId = session.user.id;

  const body = await req.json().catch(() => ({})) as { name?: string; description?: string; isPublic?: boolean };
  if (!body.name?.trim()) return NextResponse.json({ error: "Потрібна назва синдикату" }, { status: 400 });
  if (body.name.trim().length < 3 || body.name.trim().length > 40) {
    return NextResponse.json({ error: "Назва: 3–40 символів" }, { status: 400 });
  }

  const existing = await prisma.syndicateMember.findUnique({ where: { playerId }, select: { id: true } });
  if (existing) return NextResponse.json({ error: "Ви вже є членом синдикату" }, { status: 400 });

  const alreadyLeader = await prisma.syndicate.findUnique({ where: { leaderId: playerId }, select: { id: true } });
  if (alreadyLeader) return NextResponse.json({ error: "Ви вже є лідером синдикату" }, { status: 400 });

  const nameTaken = await prisma.syndicate.findUnique({ where: { name: body.name.trim() }, select: { id: true } });
  if (nameTaken) return NextResponse.json({ error: "Назва вже зайнята" }, { status: 409 });

  const syndicate = await prisma.$transaction(async (tx) => {
    const s = await tx.syndicate.create({
      data: {
        name:        body.name!.trim(),
        description: body.description?.trim() || null,
        leaderId:    playerId,
        isPublic:    body.isPublic ?? true,
      },
    });
    await tx.syndicateMember.create({
      data: { syndicateId: s.id, playerId, role: "LEADER" },
    });
    return s;
  });

  return NextResponse.json({ ok: true, syndicateId: syndicate.id }, { status: 201 });
}
