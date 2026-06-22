import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const syndicate = await prisma.syndicate.findUnique({
    where : { id }, select: { ownerId: true, name: true },
  });
  if (!syndicate) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (syndicate.ownerId === session.user.id)
    return NextResponse.json({ error: "Власник не може покинути синдикат. Використайте 'Розпустити'." }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id }, select: { syndicateId: true, username: true },
  });
  if (user?.syndicateId !== id)
    return NextResponse.json({ error: "Ви не є членом цього синдикату" }, { status: 403 });

  await prisma.$transaction([
    prisma.user.update({ where: { id: session.user.id }, data: { syndicateId: null } }),
    prisma.syndicateActivityLog.create({
      data: { syndicateId: id, userId: session.user.id, type: "LEAVE",
              message: `@${user?.username} покинув синдикат` },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
