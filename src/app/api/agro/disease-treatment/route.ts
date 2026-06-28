import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const PESTICIDE_COST_KG = 8; // кг RM-PESTICIDE для лікування

// POST /api/agro/disease-treatment  { enterpriseId }
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const playerId = session.user.id;

  const { enterpriseId } = await req.json().catch(() => ({})) as { enterpriseId?: string };
  if (!enterpriseId) return NextResponse.json({ error: "enterpriseId required" }, { status: 400 });

  const enterprise = await prisma.enterprise.findFirst({
    where: { id: enterpriseId, playerId, type: "AGRO_FARM", isOperational: true },
    select: {
      id: true,
      landPlot: { select: { id: true, cropDiseaseType: true, cropDiseaseSeverity: true } },
      inventory: { select: { id: true, quantity: true, product: { select: { sku: true } } } },
    },
  });
  if (!enterprise) return NextResponse.json({ error: "Ферму не знайдено" }, { status: 404 });
  if (!enterprise.landPlot) return NextResponse.json({ error: "Немає земельної ділянки" }, { status: 400 });
  if (!enterprise.landPlot.cropDiseaseType) return NextResponse.json({ error: "Хвороб немає" }, { status: 400 });

  const pestInv = enterprise.inventory.find(i => i.product.sku === "RM-PESTICIDE");
  if (!pestInv || Number(pestInv.quantity) < PESTICIDE_COST_KG) {
    return NextResponse.json({ error: `Потрібно ${PESTICIDE_COST_KG} кг RM-PESTICIDE` }, { status: 400 });
  }

  const diseaseType = enterprise.landPlot.cropDiseaseType;
  const severity    = enterprise.landPlot.cropDiseaseSeverity;

  // FUNGAL: пестицид повністю лікує. VIRAL: знижує severity на 50%
  const newSeverity = diseaseType === 'VIRAL' ? Math.max(0, severity - 0.4) : 0;
  const newType     = newSeverity > 0 ? diseaseType : null;

  await prisma.$transaction([
    prisma.enterpriseInventory.update({
      where: { id: pestInv.id },
      data:  { quantity: { decrement: PESTICIDE_COST_KG } },
    }),
    prisma.landPlot.update({
      where: { id: enterprise.landPlot.id },
      data:  { cropDiseaseType: newType, cropDiseaseSeverity: newSeverity },
    }),
  ]);

  const msg = diseaseType === 'FUNGAL'
    ? 'Грибкова хвороба вилікувана. Врожайність відновлена.'
    : newSeverity > 0
      ? `Вірус послаблено до ${Math.round(newSeverity * 100)}% тяжкості. Застосуйте ще раз для повного лікування.`
      : 'Вірусна хвороба подолана!';

  return NextResponse.json({ ok: true, message: msg, newSeverity, cured: newType === null });
}
