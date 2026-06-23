import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StockExchangeService } from "@/engine/StockExchangeService";

// POST — place order: { tickerId, type, quantity, pricePerShareUah }
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;
  const body = await req.json().catch(() => ({})) as {
    tickerId?: string;
    type?: "BUY" | "SELL";
    quantity?: number;
    pricePerShareUah?: number;
  };

  if (!body.tickerId || !body.type || !body.quantity || !body.pricePerShareUah) {
    return NextResponse.json({ error: "Потрібен tickerId, type, quantity, pricePerShareUah" }, { status: 400 });
  }
  if (!["BUY", "SELL"].includes(body.type)) {
    return NextResponse.json({ error: "type має бути BUY або SELL" }, { status: 400 });
  }

  const lastTick = await prisma.gameTick.findFirst({ orderBy: { tickNumber: "desc" }, select: { tickNumber: true } });
  const currentTick = lastTick?.tickNumber ?? 1n;

  const svc = new StockExchangeService(prisma);
  try {
    const result = await svc.placeStockOrder(
      playerId, body.tickerId, body.type, body.quantity, body.pricePerShareUah, currentTick,
    );
    return NextResponse.json({ ok: true, orderId: result.orderId }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Помилка";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
