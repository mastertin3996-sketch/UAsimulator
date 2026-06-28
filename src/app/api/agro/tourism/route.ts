import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const BASE_TOURISM_REVENUE = 500; // ₴/тік base
const ORGANIC_BONUS        = 1.3;

// POST /api/agro/tourism  { enterpriseId, enabled: boolean }
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const playerId = session.user.id;

  const { enterpriseId, enabled } = await req.json().catch(() => ({})) as { enterpriseId?: string; enabled?: boolean };
  if (!enterpriseId || typeof enabled !== 'boolean') return NextResponse.json({ error: "enterpriseId і enabled required" }, { status: 400 });

  const enterprise = await prisma.enterprise.findFirst({
    where: { id: enterpriseId, playerId, type: "AGRO_FARM" },
    select: {
      id: true, isOperational: true,
      landPlot: { select: { soilQuality: true } },
      licenses: { where: { type: 'ORGANIC_CERT', status: 'ACTIVE' }, select: { id: true } },
    },
  });
  if (!enterprise) return NextResponse.json({ error: "Ферму не знайдено" }, { status: 404 });

  if (enabled && !enterprise.isOperational) {
    return NextResponse.json({ error: "Ферма неактивна" }, { status: 400 });
  }
  if (enabled && (enterprise.landPlot?.soilQuality ?? 0) < 6) {
    return NextResponse.json({ error: "Для агротуризму потрібна якість ґрунту ≥ 6" }, { status: 400 });
  }

  const hasOrganic = enterprise.licenses.length > 0;
  const revenuePerTick = enabled
    ? Math.round(BASE_TOURISM_REVENUE * (hasOrganic ? ORGANIC_BONUS : 1.0))
    : 0;

  await prisma.enterprise.update({
    where: { id: enterpriseId },
    data:  { agroTourismEnabled: enabled, agroTourismRevenuePerTick: revenuePerTick },
  });

  return NextResponse.json({
    ok: true, enabled,
    revenuePerTick,
    message: enabled
      ? `Агротуризм активовано. Пасивний дохід: ₴${revenuePerTick}/тік${hasOrganic ? ' (органік +30%)' : ''}.`
      : 'Агротуризм вимкнено.',
  });
}
