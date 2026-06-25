import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/market/orderbook?productId=...
// Returns asks (sells) + bids (buys) + last 20 trades + reference price
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const productId = new URL(req.url).searchParams.get("productId");
  if (!productId) return NextResponse.json({ error: "productId required" }, { status: 400 });

  const now = new Date();

  const [asks, bids, trades, refPrice] = await Promise.all([
    // SELL orders sorted ask-price low → high
    prisma.marketOrder.findMany({
      where:   { productId, type: "SELL", status: { in: ["OPEN", "PARTIALLY_FILLED"] }, expiresAt: { gt: now } },
      orderBy: [{ pricePerUnit: "asc" }, { createdAt: "asc" }],
      take:    20,
      select:  { id: true, pricePerUnit: true, qualityMin: true, quality: true, quantityTotal: true, quantityFilled: true, playerId: true, expiresAt: true,
                 player: { select: { username: true } } },
    }),
    // BUY orders sorted bid-price high → low
    prisma.marketOrder.findMany({
      where:   { productId, type: "BUY", status: { in: ["OPEN", "PARTIALLY_FILLED"] }, expiresAt: { gt: now } },
      orderBy: [{ pricePerUnit: "desc" }, { createdAt: "asc" }],
      take:    20,
      select:  { id: true, pricePerUnit: true, qualityMin: true, quantityTotal: true, quantityFilled: true, playerId: true, expiresAt: true,
                 player: { select: { username: true } } },
    }),
    // Last 20 executed trades
    prisma.marketTrade.findMany({
      where:   { OR: [
        { sellOrder: { productId } },
        { buyOrder:  { productId } },
      ] },
      orderBy: { executedAt: "desc" },
      take:    20,
      select:  { pricePerUnit: true, quantity: true, quality: true, executedAt: true },
    }),
    // NPC reference price
    prisma.npcDemand.findFirst({
      where:   { productId },
      select:  { referencePrice: true },
    }),
  ]);

  const myId = session.user.id;
  const refP = Number(refPrice?.referencePrice ?? 0);

  return NextResponse.json({
    asks: asks.map((o) => ({
      id:         o.id,
      price:      Number(o.pricePerUnit),
      qty:        o.quantityTotal - o.quantityFilled,
      quality:    o.quality ?? 7,
      isMe:       o.playerId === myId,
      seller:     o.player.username,
    })),
    bids: bids.map((o) => ({
      id:         o.id,
      price:      Number(o.pricePerUnit),
      qty:        o.quantityTotal - o.quantityFilled,
      qualityMin: o.qualityMin ?? 0,
      isMe:       o.playerId === myId,
      buyer:      o.player.username,
    })),
    trades: trades.map((t) => ({
      price:      Number(t.pricePerUnit),
      qty:        t.quantity,
      quality:    t.quality,
      executedAt: t.executedAt.toISOString(),
    })),
    refPrice: refP,
    spread:   asks[0] && bids[0]
      ? Number(asks[0].pricePerUnit) - Number(bids[0].pricePerUnit)
      : null,
  });
}
