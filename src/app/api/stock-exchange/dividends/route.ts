import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StockExchangeService } from "@/engine/StockExchangeService";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;
  const body = await req.json().catch(() => ({})) as { totalPoolUah?: number };

  if (!body.totalPoolUah || body.totalPoolUah <= 0) {
    return NextResponse.json({ error: "Потрібен totalPoolUah > 0" }, { status: 400 });
  }

  const lastTick = await prisma.gameTick.findFirst({ orderBy: { tickNumber: "desc" }, select: { tickNumber: true } });
  const currentTick = lastTick?.tickNumber ?? 1n;

  const svc = new StockExchangeService(prisma);
  try {
    const result = await svc.distributeDividends(playerId, body.totalPoolUah, currentTick);
    return NextResponse.json({
      ok: true,
      symbol:               result.symbol,
      dividendPerShare:     Number(result.dividendPerShare),
      shareholdersRewarded: result.shareholdersRewarded,
      totalPaidUah:         Number(result.totalPaidUah),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Помилка";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
