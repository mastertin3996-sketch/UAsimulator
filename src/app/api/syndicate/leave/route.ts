import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const playerId = session.user.id;

  const member = await prisma.syndicateMember.findUnique({
    where:   { playerId },
    include: { syndicate: { select: { leaderId: true, _count: { select: { members: true } } } } },
  });
  if (!member) return NextResponse.json({ error: "Ви не є членом синдикату" }, { status: 400 });

  if (member.syndicate.leaderId === playerId) {
    if (member.syndicate._count.members > 1) {
      return NextResponse.json({ error: "Лідер не може покинути синдикат з членами. Спочатку передайте лідерство." }, { status: 400 });
    }
    // Dissolve syndicate if leader is last member
    await prisma.$transaction([
      prisma.syndicateMember.delete({ where: { playerId } }),
      prisma.syndicate.delete({ where: { leaderId: playerId } }),
    ]);
    return NextResponse.json({ ok: true, dissolved: true });
  }

  await prisma.syndicateMember.delete({ where: { playerId } });
  return NextResponse.json({ ok: true });
}
