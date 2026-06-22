import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const cityId = searchParams.get("cityId");

  const plots = await prisma.landPlot.findMany({
    where: {
      status: "AVAILABLE",
      ...(cityId ? { cityId } : {}),
    },
    select: {
      id: true, cadastralNumber: true, totalAreaM2: true,
      purchasePriceUah: true, monthlyLeaseCostUah: true,
      status: true,
      city: { select: { id: true, nameUa: true, region: true } },
    },
    orderBy: { totalAreaM2: "asc" },
    take: 50,
  });

  // Also return player's existing plots
  const myPlots = await prisma.landPlot.findMany({
    where: { playerId: session.user.id },
    select: {
      id: true, cadastralNumber: true, totalAreaM2: true, usedAreaM2: true,
      purchasePriceUah: true, monthlyLeaseCostUah: true, status: true,
      city: { select: { id: true, nameUa: true, region: true } },
    },
  });

  return NextResponse.json({
    available: plots.map((p) => ({
      id: p.id, cadastralNumber: p.cadastralNumber, totalAreaM2: p.totalAreaM2,
      purchasePriceUah: Number(p.purchasePriceUah),
      monthlyLeaseCostUah: Number(p.monthlyLeaseCostUah),
      status: p.status, city: p.city,
    })),
    mine: myPlots.map((p) => ({
      id: p.id, cadastralNumber: p.cadastralNumber,
      totalAreaM2: p.totalAreaM2, usedAreaM2: p.usedAreaM2,
      purchasePriceUah: Number(p.purchasePriceUah),
      monthlyLeaseCostUah: Number(p.monthlyLeaseCostUah),
      status: p.status, city: p.city,
      freeAreaM2: p.totalAreaM2 - p.usedAreaM2,
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;
  const body = await req.json().catch(() => ({}));
  const { plotId, action } = body as { plotId?: string; action?: "buy" | "lease" };

  if (!plotId || !action || !["buy", "lease"].includes(action)) {
    return NextResponse.json({ error: "Потрібен plotId та action (buy|lease)" }, { status: 400 });
  }

  const plot = await prisma.landPlot.findUnique({ where: { id: plotId } });
  if (!plot) return NextResponse.json({ error: "Ділянка не знайдена" }, { status: 404 });
  if (plot.status !== "AVAILABLE") return NextResponse.json({ error: "Ділянка вже зайнята" }, { status: 409 });

  const player = await prisma.player.findUniqueOrThrow({ where: { id: playerId } });
  const balance = new Decimal(player.cashBalance.toString());

  if (action === "buy") {
    const cost = new Decimal(plot.purchasePriceUah.toString());
    if (balance.lessThan(cost)) {
      return NextResponse.json({ error: `Недостатньо коштів. Потрібно ${cost.toFixed(0)} ₴, є ${balance.toFixed(0)} ₴` }, { status: 400 });
    }

    const newBalance = balance.minus(cost);

    await prisma.$transaction([
      prisma.landPlot.update({
        where: { id: plotId },
        data: { playerId, status: "OWNED", purchasedAt: new Date() },
      }),
      prisma.player.update({
        where: { id: playerId },
        data: { cashBalance: newBalance },
      }),
      prisma.financialTransaction.create({
        data: {
          playerId, type: "LAND_PURCHASE",
          amountUah: cost.negated(),
          balanceBefore: balance,
          balanceAfter: newBalance,
          description: `Купівля ділянки ${plot.cadastralNumber} (${plot.totalAreaM2} м²)`,
          referenceId: plotId,
        },
      }),
    ]);

    return NextResponse.json({ ok: true, action: "bought", balanceAfter: newBalance.toFixed(2) });
  } else {
    // Lease — no upfront cost, monthly payment charged by tick engine
    await prisma.landPlot.update({
      where: { id: plotId },
      data: { playerId, status: "LEASED", leaseStartDate: new Date() },
    });
    return NextResponse.json({ ok: true, action: "leased" });
  }
}
