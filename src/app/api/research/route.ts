import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ResearchDevelopmentService } from "@/engine/ResearchDevelopmentService";

const setActiveResearchSchema = z.object({
  techCode: z.string().min(1).nullable().optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;
  const svc = new ResearchDevelopmentService(prisma);

  const [techTree, rpPerTick, player] = await Promise.all([
    svc.getAvailableTechTree(playerId),
    svc.calculateResearchGenerationTick(playerId),
    prisma.player.findUniqueOrThrow({
      where: { id: playerId },
      select: { activeResearchTechId: true },
    }),
  ]);

  // Find unlocked + in-progress nodes for summary
  const unlocked   = techTree.filter(t => t.status === "UNLOCKED").length;
  const inProgress = techTree.find(t => t.status === "IN_PROGRESS");

  return NextResponse.json({
    techTree: techTree.map(t => ({
      ...t,
      unlockedAtTick: t.unlockedAtTick ? Number(t.unlockedAtTick) : null,
    })),
    rpPerTick,
    activeResearchTechId: player.activeResearchTechId,
    summary: {
      total:    techTree.length,
      unlocked,
      inProgress: inProgress
        ? {
            code:     inProgress.code,
            name:     inProgress.name,
            progress: inProgress.currentProgressPoints,
            required: inProgress.requiredResearchPoints,
            eta:      rpPerTick > 0
              ? Math.ceil((inProgress.requiredResearchPoints - inProgress.currentProgressPoints) / rpPerTick)
              : null,
          }
        : null,
    },
  });
}

// POST — set active research: { techCode: string | null }
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;
  const rawBody = await req.json().catch(() => null);
  const parsed  = setActiveResearchSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Некоректний techCode" }, { status: 400 });
  }
  const body = parsed.data;

  let techId: string | null = null;
  if (body.techCode) {
    const tech = await prisma.technology.findUnique({
      where: { code: body.techCode as import("@prisma/client").TechCode },
      select: { id: true },
    });
    if (!tech) return NextResponse.json({ error: "Технологія не знайдена" }, { status: 404 });
    techId = tech.id;
  }

  await prisma.player.update({
    where: { id: playerId },
    data:  { activeResearchTechId: techId },
  });

  return NextResponse.json({ ok: true });
}
