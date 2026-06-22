import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const syndicate = await prisma.syndicate.findUnique({
    where  : { id },
    include: { members: { select: { id: true } } },
  });
  if (!syndicate) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (syndicate.ownerId !== session.user.id)
    return NextResponse.json({ error: "Тільки власник може розпустити синдикат" }, { status: 403 });

  // Disconnect all members first (set syndicateId = null)
  const memberIds = syndicate.members.map((m) => m.id);

  await prisma.$transaction([
    prisma.user.updateMany({
      where: { id: { in: memberIds } },
      data : { syndicateId: null },
    }),
    // Cascade deletes handle invites/contributions/logs via onDelete: Cascade
    prisma.syndicate.delete({ where: { id } }),
  ]);

  return NextResponse.json({ ok: true });
}
