import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const syndicate = await prisma.syndicate.findUnique({
    where: { id }, select: { ownerId: true, name: true },
  });
  if (!syndicate) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (syndicate.ownerId !== session.user.id)
    return NextResponse.json({ error: "Тільки власник може виключати учасників" }, { status: 403 });

  const body = await req.json() as { userId: string };
  if (body.userId === session.user.id)
    return NextResponse.json({ error: "Не можна виключити себе" }, { status: 400 });

  const target = await prisma.user.findUnique({
    where: { id: body.userId }, select: { syndicateId: true, username: true },
  });
  if (!target || target.syndicateId !== id)
    return NextResponse.json({ error: "Учасника не знайдено" }, { status: 404 });

  await prisma.$transaction([
    prisma.user.update({ where: { id: body.userId }, data: { syndicateId: null } }),
    prisma.notification.create({
      data: { userId: body.userId, type: "SYNDICATE_KICK",
              title: "Виключено з синдикату",
              body : `Вас виключено зі синдикату «${syndicate.name}».` },
    }),
    prisma.syndicateActivityLog.create({
      data: { syndicateId: id, userId: session.user.id, type: "KICK",
              message: `@${target.username} виключено зі синдикату` },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
