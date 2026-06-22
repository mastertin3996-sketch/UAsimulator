import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SYNDICATE } from "@/lib/syndicate-config";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { name: string; description?: string };
  const name = (body.name ?? "").trim();
  if (!name || name.length < 3 || name.length > 40) {
    return NextResponse.json({ error: "Назва: 3–40 символів" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where : { id: session.user.id },
    select: { syndicateId: true, ownedSyndicate: { select: { id: true } }, wallet: { select: { gameCash: true } } },
  });
  if (user?.syndicateId || user?.ownedSyndicate) {
    return NextResponse.json({ error: "Ви вже є членом або власником синдикату" }, { status: 400 });
  }
  if (Number(user?.wallet?.gameCash ?? 0) < SYNDICATE.CREATE_COST_GC) {
    return NextResponse.json({
      error: `Потрібно ${SYNDICATE.CREATE_COST_GC.toLocaleString("uk-UA")} GC`,
    }, { status: 400 });
  }

  const existing = await prisma.syndicate.findUnique({ where: { name } });
  if (existing) return NextResponse.json({ error: "Назва вже зайнята" }, { status: 409 });

  const [syndicate] = await prisma.$transaction([
    prisma.syndicate.create({
      data: {
        name,
        description: body.description?.trim() || null,
        ownerId    : session.user.id,
        members    : { connect: { id: session.user.id } },
      },
    }),
    prisma.userWallet.update({
      where: { userId: session.user.id },
      data : { gameCash: { decrement: SYNDICATE.CREATE_COST_GC } },
    }),
  ]);

  await prisma.syndicateActivityLog.create({
    data: { syndicateId: syndicate.id, userId: session.user.id, type: "CREATE",
            message: `Синдикат «${name}» засновано` },
  });

  return NextResponse.json({ syndicate }, { status: 201 });
}
