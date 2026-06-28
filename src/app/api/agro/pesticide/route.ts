import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const PESTICIDE_COST_KG = 5;

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
      landPlot: { select: { id: true, pestDamageMult: true } },
      inventory: { select: { id: true, quantity: true, product: { select: { sku: true } } } },
    },
  });
  if (!enterprise) return NextResponse.json({ error: "Ферму не знайдено" }, { status: 404 });
  if (!enterprise.landPlot) return NextResponse.json({ error: "Немає земельної ділянки" }, { status: 400 });

  if (enterprise.landPlot.pestDamageMult >= 1.0) {
    return NextResponse.json({ error: "Шкідників немає — пестицид не потрібен" }, { status: 400 });
  }

  const pestInv = enterprise.inventory.find(i => i.product.sku === "RM-PESTICIDE");
  if (!pestInv || Number(pestInv.quantity) < PESTICIDE_COST_KG) {
    return NextResponse.json({ error: `Недостатньо пестициду. Потрібно ${PESTICIDE_COST_KG} кг RM-PESTICIDE` }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.enterpriseInventory.update({
      where: { id: pestInv.id },
      data:  { quantity: { decrement: PESTICIDE_COST_KG } },
    }),
    prisma.landPlot.update({
      where: { id: enterprise.landPlot.id },
      data:  { pestDamageMult: 1.0 },
    }),
  ]);

  return NextResponse.json({ ok: true, message: "Шкідників знищено. Врожайність відновлена." });
}
