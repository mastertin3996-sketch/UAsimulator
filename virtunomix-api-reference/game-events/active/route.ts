import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const lastTick   = await prisma.gameTick.findFirst({ orderBy: { tickNumber: "desc" } });
  const currentTick = lastTick?.tickNumber ?? 0;

  // Expire stale events on read (defensive)
  await prisma.gameEvent.updateMany({
    where: { isActive: true, endTick: { lte: currentTick } },
    data : { isActive: false },
  });

  const events = await prisma.gameEvent.findMany({
    where  : { isActive: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    currentTick,
    events: events.map((e) => ({
      id             : e.id,
      title          : e.title,
      description    : e.description,
      targetType     : e.targetType,
      targetId       : e.targetId,
      modifierType   : e.modifierType,
      valueMultiplier: Number(e.valueMultiplier),
      startTick      : e.startTick,
      endTick        : e.endTick,
      durationTicks  : e.durationTicks,
      ticksRemaining : Math.max(0, e.endTick - currentTick),
      sentiment      : e.sentiment,
    })),
  });
}
