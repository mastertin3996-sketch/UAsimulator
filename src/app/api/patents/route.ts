/**
 * GET  /api/patents  — патенти поточного гравця, доступні для реєстрації технології
 *                       (розблоковані, ще не запатентовані), і власні позови (як позивач/відповідач).
 * POST /api/patents  — реєстрація нового патенту: { technologyCode }.
 *
 * CorporateSecurityService.registerPatent() працює на рівні ГРАВЦЯ (Patent.playerId),
 * не підприємства — enterpriseId у тілі запиту не потрібен.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { TechCode } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CorporateSecurityService } from "@/engine/CorporateSecurityService";
import { allowRate } from "@/lib/rateLimit";

// Дзеркалить PATENT_FEE_UAH з CorporateSecurityService — суто для відображення в UI;
// фактична сума завжди розраховується й списується сервісом на сервері.
const PATENT_FEE_DISPLAY_UAH = 200_000;

const registerPatentSchema = z.object({
  technologyCode: z.nativeEnum(TechCode),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;

  const [patents, lawsuitsAsPlaintiff, lawsuitsAsDefendant, unlockedTechs, allTechs] = await Promise.all([
    prisma.patent.findMany({
      where:   { playerId, isActive: true },
      orderBy: { registeredAtTick: "desc" },
    }),
    prisma.legalAction.findMany({
      where:   { plaintiffId: playerId },
      orderBy: { createdAt: "desc" },
      take:    20,
      include: { defendant: { select: { companyName: true, username: true } } },
    }),
    prisma.legalAction.findMany({
      where:   { defendantId: playerId },
      orderBy: { createdAt: "desc" },
      take:    20,
      include: { plaintiff: { select: { companyName: true, username: true } } },
    }),
    prisma.playerTechnology.findMany({
      where:   { playerId, isUnlocked: true },
      include: { technology: { select: { code: true, name: true } } },
    }),
    prisma.technology.findMany({ select: { code: true, name: true } }),
  ]);

  const techNameByCode = new Map(allTechs.map(t => [t.code as string, t.name]));
  const patentedCodes  = new Set(patents.map(p => p.technologyCode));

  return NextResponse.json({
    patentFeeUah: PATENT_FEE_DISPLAY_UAH,
    patents: patents.map(p => ({
      id:                p.id,
      technologyCode:    p.technologyCode,
      technologyName:    techNameByCode.get(p.technologyCode) ?? p.technologyCode,
      licenseRoyaltyPct: p.licenseRoyaltyPct,
      registeredAtTick:  p.registeredAtTick.toString(),
    })),
    registerable: unlockedTechs
      .filter(pt => !patentedCodes.has(pt.technology.code))
      .map(pt => ({ code: pt.technology.code, name: pt.technology.name })),
    lawsuitsAsPlaintiff: lawsuitsAsPlaintiff.map(l => ({
      id: l.id, technologyCode: l.technologyCode, status: l.status,
      defendantName:  l.defendant.companyName || l.defendant.username,
      benefitUah:  Number(l.benefitUah), penaltyUah: Number(l.penaltyUah),
      description: l.description, resolvedAtTick: l.resolvedAtTick.toString(),
    })),
    lawsuitsAsDefendant: lawsuitsAsDefendant.map(l => ({
      id: l.id, technologyCode: l.technologyCode, status: l.status,
      plaintiffName: l.plaintiff.companyName || l.plaintiff.username,
      benefitUah:  Number(l.benefitUah), penaltyUah: Number(l.penaltyUah),
      description: l.description, resolvedAtTick: l.resolvedAtTick.toString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;

  if (!(await allowRate(`patent-register:${playerId}`, 3000))) {
    return NextResponse.json({ error: "Забагато запитів — спробуйте за кілька секунд" }, { status: 429 });
  }

  const rawBody = await req.json().catch(() => null);
  const parsed  = registerPatentSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Некоректний technologyCode" }, { status: 400 });
  }

  const tickRow = await prisma.gameTick.findFirst({ orderBy: { tickNumber: "desc" }, select: { tickNumber: true } });
  const currentTick = tickRow?.tickNumber ?? 0n;

  try {
    const svc    = new CorporateSecurityService(prisma);
    const result = await svc.registerPatent(playerId, parsed.data.technologyCode, currentTick);
    return NextResponse.json({
      ok: true,
      patentId:       result.patentId,
      technologyCode: result.technologyCode,
      feeUah:         Number(result.feeUah),
    }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Помилка";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
