import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StockExchangeService } from "@/engine/StockExchangeService";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;
  const body = await req.json().catch(() => ({})) as {
    symbol?: string;
    sharesToIssue?: number;
    initialPriceUah?: number;
  };

  if (!body.symbol || !body.sharesToIssue || !body.initialPriceUah) {
    return NextResponse.json({ error: "Потрібен symbol, sharesToIssue, initialPriceUah" }, { status: 400 });
  }

  const lastTick = await prisma.gameTick.findFirst({ orderBy: { tickNumber: "desc" }, select: { tickNumber: true } });
  const currentTick = lastTick?.tickNumber ?? 1n;

  const svc = new StockExchangeService(prisma);
  try {
    const result = await svc.launchInitialPublicOffering(
      playerId, body.symbol, body.sharesToIssue, body.initialPriceUah, currentTick,
    );
    return NextResponse.json({
      ok: true,
      tickerId:          result.tickerId,
      symbol:            result.symbol,
      totalSharesIssued: Number(result.totalSharesIssued),
      founderShares:     Number(result.founderShares),
      floatShares:       Number(result.floatShares),
      initialPriceUah:   Number(result.initialPriceUah),
      initialMarketCap:  Number(result.initialMarketCap),
    }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Помилка";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
