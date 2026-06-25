import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const UA_STATUS: Record<string, string> = {
  OPEN: "ACTIVE", PARTIALLY_FILLED: "ACTIVE",
  FILLED: "FILLED", CANCELLED: "CANCELLED", EXPIRED: "EXPIRED",
};

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;
  const { searchParams } = new URL(req.url);
  const status  = searchParams.get("status") ?? "ACTIVE";
  const orderType = searchParams.get("type") ?? "SELL"; // "SELL" | "BUY"

  const where: Record<string, unknown> = { playerId, type: orderType };
  if (status === "ACTIVE") {
    where.status    = { in: ["OPEN", "PARTIALLY_FILLED"] };
    where.expiresAt = { gt: new Date() };
  } else if (status !== "ALL") {
    where.status = { FILLED: "FILLED", CANCELLED: "CANCELLED", EXPIRED: "EXPIRED" }[status] ?? status;
  }

  const orders = await prisma.marketOrder.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take:    100,
    select:  {
      id: true, type: true, pricePerUnit: true, quality: true, qualityMin: true,
      quantityTotal: true, quantityFilled: true,
      status: true, expiresAt: true, createdAt: true,
      product: { select: { id: true, nameUa: true, unit: true } },
    },
  });

  // Base prices
  const productIds  = [...new Set(orders.map((o) => o.product.id))];
  const npcPrices   = await prisma.npcDemand.groupBy({
    by:    ["productId"],
    where: { productId: { in: productIds } },
    _avg:  { referencePrice: true },
  });
  const basePriceMap = new Map(npcPrices.map((n) => [n.productId, Number(n._avg.referencePrice ?? 0)]));

  // Revenue from trades (SELL only) or spend (BUY only)
  const orderIds = orders.map((o) => o.id);
  let tradeValueMap = new Map<string, number>();
  if (orderIds.length > 0) {
    const trades = await prisma.marketTrade.findMany({
      where: orderType === "SELL"
        ? { sellOrderId: { in: orderIds } }
        : { buyOrderId:  { in: orderIds } },
      select: {
        sellOrderId: true,
        buyOrderId:  true,
        quantity:    true,
        pricePerUnit: true,
      },
    });
    for (const t of trades) {
      const id  = orderType === "SELL" ? t.sellOrderId : t.buyOrderId;
      const cur = tradeValueMap.get(id) ?? 0;
      tradeValueMap.set(id, cur + t.quantity * Number(t.pricePerUnit));
    }
  }

  const offers = orders.map((o) => {
    const price     = Number(o.pricePerUnit);
    const basePrice = basePriceMap.get(o.product.id) ?? price;
    return {
      id:           o.id,
      type:         o.type,
      productId:    o.product.id,
      productName:  o.product.nameUa,
      productUnit:  o.product.unit,
      basePrice,
      price,
      qualityMin:   o.qualityMin ?? 0,
      quality:      o.quality ?? 7.0,
      quantity:     o.quantityTotal,
      qtyFilled:    o.quantityFilled,
      qtyRemaining: o.quantityTotal - o.quantityFilled,
      status:       UA_STATUS[o.status] ?? o.status,
      expiresAt:    o.expiresAt.toISOString(),
      createdAt:    o.createdAt.toISOString(),
      priceVsBase:  basePrice > 0 ? price / basePrice : 1,
      // SELL → revenue earned; BUY → spend committed
      value:        tradeValueMap.get(o.id) ?? 0,
    };
  });

  return NextResponse.json({ offers });
}
