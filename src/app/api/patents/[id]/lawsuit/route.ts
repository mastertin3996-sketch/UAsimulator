/**
 * GET  /api/patents/[id]/lawsuit — кандидати-відповідачі: гравці, що використовують
 *                                   ту саму технологію без запиту дозволу (для вибору в UI).
 * POST /api/patents/[id]/lawsuit — подати позов: { defendantId }.
 *
 * [id] — Patent.id, який має належати поточному гравцю (позивачу).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CorporateSecurityService } from "@/engine/CorporateSecurityService";
import { allowRate } from "@/lib/rateLimit";

type Params = { params: Promise<{ id: string }> };

const lawsuitSchema = z.object({
  defendantId: z.string().min(1),
});

async function loadOwnPatent(patentId: string, playerId: string) {
  const patent = await prisma.patent.findUnique({ where: { id: patentId } });
  if (!patent || patent.playerId !== playerId) return null;
  return patent;
}

// GET — кандидати-відповідачі для цього патенту (інші гравці з розблокованою технологією)
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: patentId } = await params;
  const patent = await loadOwnPatent(patentId, session.user.id);
  if (!patent) return NextResponse.json({ error: "Патент не знайдено" }, { status: 404 });
  if (!patent.isActive) return NextResponse.json({ error: "Патент неактивний" }, { status: 400 });

  const tech = await prisma.technology.findUnique({
    where:  { code: patent.technologyCode as never },
    select: { id: true },
  });
  if (!tech) return NextResponse.json({ error: "Технологія не знайдена в каталозі" }, { status: 404 });

  const [candidates, existingActions] = await Promise.all([
    prisma.playerTechnology.findMany({
      where:   { technologyId: tech.id, isUnlocked: true, playerId: { not: session.user.id } },
      include: { player: { select: { id: true, companyName: true, username: true } } },
    }),
    prisma.legalAction.findMany({
      where: {
        plaintiffId:    session.user.id,
        technologyCode: patent.technologyCode,
        status:         { not: "DEFENDANT_WON" },
      },
      select: { defendantId: true },
    }),
  ]);

  const alreadySued = new Set(existingActions.map(a => a.defendantId));

  return NextResponse.json({
    technologyCode: patent.technologyCode,
    candidates: candidates
      .filter(c => !alreadySued.has(c.playerId))
      .map(c => ({
        defendantId: c.player.id,
        name:        c.player.companyName || c.player.username,
      })),
  });
}

// POST — подати позов: { defendantId }
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;

  if (!(await allowRate(`patent-lawsuit:${playerId}`, 5000))) {
    return NextResponse.json({ error: "Забагато запитів — спробуйте за кілька секунд" }, { status: 429 });
  }

  const { id: patentId } = await params;
  const patent = await loadOwnPatent(patentId, playerId);
  if (!patent) return NextResponse.json({ error: "Патент не знайдено" }, { status: 404 });

  const rawBody = await req.json().catch(() => null);
  const parsed  = lawsuitSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Потрібен defendantId" }, { status: 400 });
  }

  const tickRow = await prisma.gameTick.findFirst({ orderBy: { tickNumber: "desc" }, select: { tickNumber: true } });
  const currentTick = tickRow?.tickNumber ?? 0n;

  try {
    const svc    = new CorporateSecurityService(prisma);
    const result = await svc.filePatentLawsuit(playerId, parsed.data.defendantId, patent.technologyCode, currentTick);
    return NextResponse.json({
      ok: true,
      legalActionId:  result.legalActionId,
      outcome:        result.outcome,
      winProbability: result.winProbability,
      benefitUah:     Number(result.benefitUah),
      penaltyUah:     Number(result.penaltyUah),
      description:    result.description,
    }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Помилка";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
