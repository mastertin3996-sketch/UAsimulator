import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const invite = await prisma.syndicateInvite.findUnique({
    where  : { id },
    include: { syndicate: { select: { id: true, name: true, level: true } } },
  });
  if (!invite || invite.invitedId !== session.user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (invite.status !== "PENDING")
    return NextResponse.json({ error: "Запрошення вже оброблено" }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id }, select: { syndicateId: true, username: true },
  });
  if (user?.syndicateId)
    return NextResponse.json({ error: "Ви вже є членом іншого синдикату" }, { status: 400 });

  await prisma.$transaction([
    prisma.syndicateInvite.update({ where: { id }, data: { status: "ACCEPTED" } }),
    prisma.user.update({ where: { id: session.user.id }, data: { syndicateId: invite.syndicateId } }),
  ]);

  await prisma.syndicateActivityLog.create({
    data: { syndicateId: invite.syndicateId, userId: session.user.id, type: "JOIN",
            message: `@${user?.username} приєднався до синдикату` },
  });

  return NextResponse.json({ ok: true, syndicateId: invite.syndicateId });
}
