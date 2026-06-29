import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Концентрат: 3 кг / 100 м²  →  0.03 кг/м²
const CONCENTRATE_KG_PER_M2 = 0.03;
// Компост: 4 кг / 1 м²
const COMPOST_KG_PER_M2     = 4.0;
const FERT_DURATION          = 90; // тіків = 3 сезони

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const playerId = session.user.id;

  const { enterpriseId, fertilizerType = "CONCENTRATE" } = await req.json().catch(() => ({})) as {
    enterpriseId?: string;
    fertilizerType?: "CONCENTRATE" | "ORGANIC";
  };
  if (!enterpriseId) return NextResponse.json({ error: "enterpriseId required" }, { status: 400 });
  if (!["CONCENTRATE", "ORGANIC"].includes(fertilizerType)) {
    return NextResponse.json({ error: "Недійсний тип добрива" }, { status: 400 });
  }

  const enterprise = await prisma.enterprise.findFirst({
    where: { id: enterpriseId, playerId, type: "AGRO_FARM", isOperational: true },
    select: {
      id: true,
      footprintM2: true,
      landPlot: { select: { id: true, fertilizerTicksLeft: true, nitrogenLevel: true, phosphorusLevel: true, potassiumLevel: true } },
      inventory: { select: { id: true, quantity: true, product: { select: { sku: true } } } },
    },
  });
  if (!enterprise)          return NextResponse.json({ error: "Ферму не знайдено" }, { status: 404 });
  if (!enterprise.landPlot) return NextResponse.json({ error: "Немає земельної ділянки" }, { status: 400 });

  const area    = enterprise.footprintM2;
  const isOrg   = fertilizerType === "ORGANIC";
  const sku     = isOrg ? "SF-COMPOST" : "AG-FERTILIZER";
  const needed  = Math.ceil(isOrg ? COMPOST_KG_PER_M2 * area : CONCENTRATE_KG_PER_M2 * area);
  const nameUa  = isOrg ? "компост (SF-COMPOST)" : "концентрат (AG-FERTILIZER)";

  const inv = enterprise.inventory.find(i => i.product.sku === sku);
  if (!inv || Number(inv.quantity) < needed) {
    return NextResponse.json({
      error: `Недостатньо: потрібно ${needed} кг ${sku} для поля ${area} м²`,
      needed,
      sku,
    }, { status: 400 });
  }

  // NPK відновлення: концентрат — N+20/P+8/K+5; компост — N+10/P+12/K+15 (збалансованіше)
  const lp = enterprise.landPlot;
  const clamp = (v: number) => Math.min(100, Math.max(0, v));
  const npkUpdate = isOrg
    ? { nitrogenLevel: clamp((lp.nitrogenLevel ?? 70) + 10), phosphorusLevel: clamp((lp.phosphorusLevel ?? 70) + 12), potassiumLevel: clamp((lp.potassiumLevel ?? 70) + 15) }
    : { nitrogenLevel: clamp((lp.nitrogenLevel ?? 70) + 20), phosphorusLevel: clamp((lp.phosphorusLevel ?? 70) + 8),  potassiumLevel: clamp((lp.potassiumLevel ?? 70) + 5)  };

  await prisma.$transaction([
    prisma.enterpriseInventory.update({
      where: { id: inv.id },
      data:  { quantity: { decrement: needed } },
    }),
    prisma.landPlot.update({
      where: { id: enterprise.landPlot.id },
      data:  { fertilizerTicksLeft: { increment: FERT_DURATION }, ...npkUpdate },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    fertilizerType,
    consumed: needed,
    sku,
    fertilizerTicksLeft: enterprise.landPlot.fertilizerTicksLeft + FERT_DURATION,
    message: `${isOrg ? "Органічне добриво" : "Мінеральний концентрат"} внесено: ${needed} кг ${nameUa} на ${area} м² (+20% врожайність, 90 тіків)`,
  });
}
