import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SYNDICATE } from "@/lib/syndicate-config";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const syndicate = await prisma.syndicate.findUnique({
    where  : { id },
    include: { members: { select: { id: true } } },
  });
  if (!syndicate) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (syndicate.ownerId !== session.user.id)
    return NextResponse.json({ error: "Тільки власник може запрошувати" }, { status: 403 });

  if (syndicate.members.length >= SYNDICATE.MAX_MEMBERS)
    return NextResponse.json({ error: `Максимум ${SYNDICATE.MAX_MEMBERS} учасників` }, { status: 400 });

  const body = await req.json() as { username: string };
  const target = await prisma.user.findUnique({
    where : { username: body.username?.trim() },
    select: { id: true, username: true, syndicateId: true },
  });
  if (!target) return NextResponse.json({ error: "Гравця не знайдено" }, { status: 404 });
  if (target.id === session.user.id)
    return NextResponse.json({ error: "Не можна запросити себе" }, { status: 400 });
  if (target.syndicateId)
    return NextResponse.json({ error: "Гравець вже є членом синдикату" }, { status: 400 });

  await prisma.syndicateInvite.upsert({
    where : { syndicateId_invitedId: { syndicateId: id, invitedId: target.id } },
    create: { syndicateId: id, invitedId: target.id, invitedById: session.user.id, status: "PENDING" },
    update: { status: "PENDING", invitedById: session.user.id, createdAt: new Date() },
  });

  await prisma.notification.create({
    data: {
      userId: target.id,
      type  : "SYNDICATE_INVITE",
      title : "Запрошення до синдикату",
      body  : `Вас запрошено до синдикату «${syndicate.name}». Прийміть або відхиліть запрошення.`,
    },
  });

  await prisma.syndicateActivityLog.create({
    data: { syndicateId: id, userId: session.user.id, type: "INVITE_SENT",
            message: `Запрошення надіслано гравцю @${target.username}` },
  });

  return NextResponse.json({ ok: true });
}
