import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const FERT_COST_KG    = 50;  // кг добрива на одну процедуру
const FERT_DURATION   = 90;  // тіків = 3 сезони

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
      landPlot: { select: { id: true, fertilizerTicksLeft: true } },
      inventory: { select: { id: true, quantity: true, product: { select: { sku: true } } } },
    },
  });
  if (!enterprise) return NextResponse.json({ error: "Ферму не знайдено" }, { status: 404 });
  if (!enterprise.landPlot) return NextResponse.json({ error: "Немає земельної ділянки" }, { status: 400 });

  const fertInv = enterprise.inventory.find(i => i.product.sku === "AG-FERTILIZER");
  if (!fertInv || Number(fertInv.quantity) < FERT_COST_KG) {
    return NextResponse.json({ error: `Недостатньо добрива. Потрібно ${FERT_COST_KG} кг AG-FERTILIZER` }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.enterpriseInventory.update({
      where: { id: fertInv.id },
      data:  { quantity: { decrement: FERT_COST_KG } },
    }),
    prisma.landPlot.update({
      where: { id: enterprise.landPlot.id },
      data:  { fertilizerTicksLeft: { increment: FERT_DURATION } },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    fertilizerTicksLeft: enterprise.landPlot.fertilizerTicksLeft + FERT_DURATION,
    message: `Добриво внесено на ${FERT_DURATION} тіків (+20% врожайність, +0.2 ґрунт/сезон)`,
  });
}
