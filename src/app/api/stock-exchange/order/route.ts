import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StockExchangeService } from "@/engine/StockExchangeService";

const placeOrderSchema = z.object({
  tickerId:         z.string().min(1),
  type:             z.enum(["BUY", "SELL"]),
  quantity:         z.number().finite().positive(),
  pricePerShareUah: z.number().finite().positive(),
});

// POST — place order: { tickerId, type, quantity, pricePerShareUah }
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;
  const rawBody = await req.json().catch(() => null);
  const parsed  = placeOrderSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Потрібен tickerId, type, quantity, pricePerShareUah" }, { status: 400 });
  }
  const body = parsed.data;

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
