import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ACHIEVEMENT_CATALOG } from "@/engine/AchievementService";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const unlocked = await prisma.achievement.findMany({
    where:  { playerId: session.user.id },
    select: { code: true, unlockedAtTick: true },
  });
  const unlockedMap = new Map(unlocked.map(a => [a.code, a.unlockedAtTick.toString()]));

  const achievements = ACHIEVEMENT_CATALOG.map(def => ({
    ...def,
    unlocked:       unlockedMap.has(def.code),
    unlockedAtTick: unlockedMap.get(def.code) ?? null,
  }));

  return NextResponse.json({
    achievements,
    unlockedCount: unlocked.length,
    totalCount:    ACHIEVEMENT_CATALOG.length,
  });
}
