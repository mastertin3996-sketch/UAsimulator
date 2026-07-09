/**
 * GET  /api/enterprises/[id]/security-system — поточна SecuritySystem, Defense Score
 *                                                та каталог рівнів 1–5 (CAPEX/утримання).
 * POST /api/enterprises/[id]/security-system — встановити/оновити рівень: { level }.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CorporateSecurityService } from "@/engine/CorporateSecurityService";
import { allowRate } from "@/lib/rateLimit";

type Params = { params: Promise<{ id: string }> };

// Дзеркалить SECURITY_INSTALL_CAPEX / SECURITY_MONTHLY_UPKEEP з CorporateSecurityService —
// суто для відображення каталогу в UI; фактичні суми завжди рахує сервіс на сервері.
const CAPEX_DISPLAY: Record<number, number> = { 1: 50_000, 2: 120_000, 3: 250_000, 4: 450_000, 5: 800_000 };
const UPKEEP_DISPLAY: Record<number, number> = { 1: 15_000, 2: 30_000, 3: 55_000, 4: 90_000, 5: 150_000 };

const installSchema = z.object({
  level: z.number().int().min(1).max(5),
});

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: enterpriseId } = await params;
  const playerId = session.user.id;

  const enterprise = await prisma.enterprise.findFirst({
    where:  { id: enterpriseId, playerId },
    select: { id: true, name: true, securitySystem: true },
  });
  if (!enterprise) return NextResponse.json({ error: "Підприємство не знайдено" }, { status: 404 });

  const svc = new CorporateSecurityService(prisma);
  const defenseScore = await svc.calculateSecurityDefenseScore(playerId, enterpriseId);

  const currentLevel = enterprise.securitySystem?.securityLevel ?? 0;

  return NextResponse.json({
    current: enterprise.securitySystem
      ? {
          id:               enterprise.securitySystem.id,
          securityLevel:    enterprise.securitySystem.securityLevel,
          guardCount:       enterprise.securitySystem.guardCount,
          monthlyUpkeepUah: Number(enterprise.securitySystem.monthlyUpkeepUah),
          isActive:         enterprise.securitySystem.isActive,
          installedAtTick:  enterprise.securitySystem.installedAtTick.toString(),
        }
      : null,
    defenseScore,
    catalog: [1, 2, 3, 4, 5].map(level => ({
      level,
      capexUah:       CAPEX_DISPLAY[level],
      deltaCapexUah:  currentLevel > 0 ? CAPEX_DISPLAY[level] - CAPEX_DISPLAY[currentLevel] : CAPEX_DISPLAY[level],
      monthlyUpkeepUah: UPKEEP_DISPLAY[level],
      available:      level > currentLevel,
    })),
  });
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: enterpriseId } = await params;
  const playerId = session.user.id;

  if (!(await allowRate(`security-system:${playerId}`, 3000))) {
    return NextResponse.json({ error: "Забагато запитів — спробуйте за кілька секунд" }, { status: 429 });
  }

  const enterprise = await prisma.enterprise.findFirst({
    where:  { id: enterpriseId, playerId },
    select: { id: true },
  });
  if (!enterprise) return NextResponse.json({ error: "Підприємство не знайдено" }, { status: 404 });

  const rawBody = await req.json().catch(() => null);
  const parsed  = installSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Рівень безпеки має бути цілим числом від 1 до 5" }, { status: 400 });
  }

  const tickRow = await prisma.gameTick.findFirst({ orderBy: { tickNumber: "desc" }, select: { tickNumber: true } });
  const currentTick = tickRow?.tickNumber ?? 0n;

  try {
    const svc    = new CorporateSecurityService(prisma);
    const result = await svc.installSecuritySystem(playerId, enterpriseId, parsed.data.level, currentTick);
    return NextResponse.json({
      ok: true,
      systemId:   result.systemId,
      level:      result.level,
      capexUah:   Number(result.capexUah),
      monthlyUah: Number(result.monthlyUah),
    }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Помилка";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
