import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FiscalBudgetService } from "@/engine/FiscalBudgetService";

const fiscal = new FiscalBudgetService(prisma);

// GET /api/subsidies — available programs + player's applications
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const playerId = session.user.id;

  // Seed on first access
  await fiscal.seedSubsidyPrograms();

  const [programs, applications, enterprises, compliance, lastTick] = await Promise.all([
    prisma.subsidyProgram.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.subsidyApplication.findMany({
      where: { playerId },
      select: { enterpriseId: true, subsidyType: true, subsidyAmountUah: true, appliedAtTick: true },
    }),
    prisma.enterprise.findMany({
      where:  { playerId, isOperational: true },
      select: { id: true, name: true, type: true },
    }),
    prisma.complianceRecord.findUnique({ where: { playerId }, select: { score: true } }),
    prisma.gameTick.findFirst({ orderBy: { tickNumber: "desc" }, select: { tickNumber: true } }),
  ]);

  const complianceScore = compliance?.score ?? 0;
  const appliedSet = new Set(applications.map(a => `${a.enterpriseId}:${a.subsidyType}`));

  return NextResponse.json({
    currentTick:     Number(lastTick?.tickNumber ?? 0),
    complianceScore,
    complianceOk:    complianceScore >= 0.90,
    enterprises,
    programs: programs.map(p => {
      const types: string[] = JSON.parse(p.enterpriseTypes as string || "[]");
      return {
        id:                p.id,
        type:              p.type,
        description:       p.description,
        subsidyPercentage: p.subsidyPercentage,
        availableFundsUah: Number(p.availableFundsUah),
        isActive:          p.isActive,
        eligibleTypes:     types,
      };
    }),
    applications: applications.map(a => ({
      enterpriseId:    a.enterpriseId,
      subsidyType:     a.subsidyType,
      amountUah:       Number(a.subsidyAmountUah),
      appliedAtTick:   Number(a.appliedAtTick),
    })),
    appliedSet: [...appliedSet],
  });
}

// POST /api/subsidies — apply for subsidy
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const playerId = session.user.id;

  const body = await req.json().catch(() => ({})) as { enterpriseId?: string; programType?: string };
  if (!body.enterpriseId || !body.programType) {
    return NextResponse.json({ error: "enterpriseId і programType обов'язкові" }, { status: 400 });
  }

  const lastTick = await prisma.gameTick.findFirst({ orderBy: { tickNumber: "desc" }, select: { tickNumber: true } });
  const currentTick = lastTick?.tickNumber ?? 1n;

  try {
    const result = await fiscal.applyForStateSubsidy(playerId, body.enterpriseId, body.programType, currentTick);
    return NextResponse.json({
      ok:              true,
      subsidyAmountUah: Number(result.subsidyAmountUah),
      baseCapexUah:    Number(result.baseCapexUah),
      balanceAfter:    Number(result.playerBalanceAfter),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Помилка";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
