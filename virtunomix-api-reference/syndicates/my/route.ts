import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSyndicateEffBonus, nextLevelThreshold } from "@/lib/syndicate-config";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where : { id: session.user.id },
    select: { syndicateId: true, ownedSyndicate: { select: { id: true } } },
  });

  // Pending invites I received
  const receivedInvites = await prisma.syndicateInvite.findMany({
    where  : { invitedId: session.user.id, status: "PENDING" },
    include: {
      syndicate: { select: { id: true, name: true, level: true, balance: true } },
      invitedBy: { select: { id: true, username: true } },
    },
    orderBy: { createdAt: "desc" },
    take   : 10,
  });

  if (!user?.syndicateId) {
    return NextResponse.json({ syndicate: null, receivedInvites, isOwner: false });
  }

  const syndicate = await prisma.syndicate.findUnique({
    where  : { id: user.syndicateId },
    include: {
      owner  : { select: { id: true, username: true } },
      members: {
        select: { id: true, username: true, syndicateId: true },
        orderBy: { username: "asc" },
      },
      activityLogs: { orderBy: { createdAt: "desc" }, take: 30 },
      invites: {
        where  : { status: "PENDING" },
        include: { invited: { select: { id: true, username: true } },
                   invitedBy: { select: { id: true, username: true } } },
      },
    },
  });

  if (!syndicate) return NextResponse.json({ syndicate: null, receivedInvites, isOwner: false });

  // Aggregate contributions per member
  const contribs = await prisma.syndicateFundContribution.groupBy({
    by     : ["userId"],
    where  : { syndicateId: syndicate.id },
    _sum   : { amount: true },
  });
  const contribMap = new Map(contribs.map((c) => [c.userId, Number(c._sum.amount ?? 0)]));

  const isOwner = syndicate.ownerId === session.user.id;

  return NextResponse.json({
    syndicate: {
      ...syndicate,
      balance      : Number(syndicate.balance),
      efficiencyBonus: getSyndicateEffBonus(syndicate.level),
      nextThreshold: nextLevelThreshold(syndicate.level),
      members: syndicate.members.map((m) => ({
        ...m,
        totalContribution: contribMap.get(m.id) ?? 0,
      })),
      myContribution: contribMap.get(session.user.id) ?? 0,
      // only owner sees sent pending invites
      invites: isOwner ? syndicate.invites : [],
    },
    receivedInvites,
    isOwner,
  });
}
