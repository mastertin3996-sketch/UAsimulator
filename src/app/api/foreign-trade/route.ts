import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ForeignTradeService } from "@/engine/ForeignTradeService";

const svc = () => new ForeignTradeService(prisma);

// GET /api/foreign-trade — tickers + player inventories + FX rate + declarations
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const playerId = session.user.id;

  const [tickers, fxRow, player, declarations, enterprises] = await Promise.all([
    prisma.globalMarketTicker.findMany({ orderBy: { commodity: "asc" } }),
    prisma.fxRateSingleton.findFirst(),
    prisma.player.findUnique({ where: { id: playerId }, select: { cashBalance: true, balanceUsd: true } }),
    prisma.customsDeclaration.findMany({
      where: { playerId, status: { in: ["PENDING", "CLEARED"] } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, type: true, status: true, resourceType: true, quantity: true,
                customsValueUsd: true, fxRateAtCreation: true, createdAt: true, clearedAtTick: true },
    }),
    prisma.enterprise.findMany({
      where: { playerId, isOperational: true },
      select: {
        id: true, name: true,
        inventory: {
          where: { quantity: { gt: 0 } },
          select: { quantity: true, product: { select: { id: true, sku: true, nameUa: true, unit: true } } },
        },
      },
    }),
  ]);

  const fxRate = fxRow ? Number(fxRow.usdToUah) : 41;

  return NextResponse.json({
    fxRate,
    cashBalance: Number(player?.cashBalance ?? 0),
    balanceUsd:  Number(player?.balanceUsd  ?? 0),
    tickers: tickers.map(t => ({
      commodity:    t.commodity,
      currentUsd:   Number(t.priceUsd),
      baselineUsd:  Number(t.baselineUsd),
      changeDay:    t.changePercent,
    })),
    declarations: declarations.map(d => {
      const usdValue = Number(d.customsValueUsd);
      const uahValue = usdValue * Number(d.fxRateAtCreation);
      return {
        id:        d.id,
        type:      d.type,
        status:    d.status,
        commodity: d.resourceType,
        quantity:  Number(d.quantity),
        usdValue,
        uahValue,
        createdAt: d.createdAt.toISOString(),
        clearedAt: d.clearedAtTick ? `Тік ${d.clearedAtTick}` : null,
      };
    }),
    enterprises: enterprises.map(e => ({
      id:        e.id,
      name:      e.name,
      inventory: e.inventory.map(i => ({
        sku:      i.product.sku,
        nameUa:   i.product.nameUa,
        unit:     i.product.unit,
        quantity: Number(i.quantity),
      })),
    })),
  });
}

// POST /api/foreign-trade — place export or FX exchange
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const playerId = session.user.id;

  const body = await req.json().catch(() => ({})) as {
    action:       "export" | "fx";
    enterpriseId?: string;
    commodity?:    string;
    quantity?:     number;
    direction?:    "UAH_TO_USD" | "USD_TO_UAH";
    amount?:       number;
  };

  const service = svc();

  try {
    if (body.action === "export") {
      if (!body.enterpriseId || !body.commodity || !body.quantity) {
        return NextResponse.json({ error: "enterpriseId, commodity та quantity обов'язкові" }, { status: 400 });
      }
      const result = await service.executeExportOrder(playerId, body.enterpriseId, body.commodity, body.quantity);
      return NextResponse.json({ ok: true, declarationId: result.declarationId, usdValue: Number(result.totalUsd) });
    }

    if (body.action === "fx") {
      if (!body.direction || !body.amount) {
        return NextResponse.json({ error: "direction та amount обов'язкові" }, { status: 400 });
      }
      const result = await service.exchangeCurrency(playerId, body.direction, body.amount);
      return NextResponse.json({ ok: true, amountOut: Number(result.amountOut), effectiveRate: Number(result.effectiveRate) });
    }

    return NextResponse.json({ error: "Невідома дія" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Помилка";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
