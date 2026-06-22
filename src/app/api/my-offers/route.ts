import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;
  const status   = (new URL(req.url)).searchParams.get("status") ?? "ACTIVE";

  const where: Record<string, unknown> = { playerId, type: "SELL" };
  if (status === "ACTIVE") {
    where.status = { in: ["OPEN", "PARTIALLY_FILLED"] };
    where.expiresAt = { gt: new Date() };
  } else if (status !== "ALL") {
    where.status = status === "FILLED" ? "FILLED" : status === "CANCELLED" ? "CANCELLED" : "EXPIRED";
  }

  const orders = await prisma.marketOrder.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true, pricePerUnit: true, quality: true,
      quantityTotal: true, quantityFilled: true,
      status: true, expiresAt: true, createdAt: true,
      resourceType: true,
      product: { select: { id: true, nameUa: true, unit: true } },
    },
  });

  // Get base prices from NpcDemand
  const productIds = [...new Set(orders.map((o) => o.product.id))];
  const npcPrices = await prisma.npcDemand.groupBy({
    by: ["productId"],
    where: { productId: { in: productIds } },
    _avg: { referencePrice: true },
  });
  const basePriceMap = new Map(npcPrices.map((n) => [n.productId, Number(n._avg.referencePrice ?? 0)]));

  // Sum revenue from trades on these orders
  const orderIds = orders.map((o) => o.id);
  const trades = await prisma.marketTrade.findMany({
    where: { sellOrderId: { in: orderIds } },
    select: { sellOrderId: true, quantity: true, pricePerUnit: true },
  });
  const revenueMap = new Map<string, number>();
  for (const t of trades) {
    const cur = revenueMap.get(t.sellOrderId) ?? 0;
    revenueMap.set(t.sellOrderId, cur + t.quantity * Number(t.pricePerUnit));
  }

  const uaStatuses: Record<string, string> = {
    OPEN: "ACTIVE", PARTIALLY_FILLED: "ACTIVE",
    FILLED: "FILLED", CANCELLED: "CANCELLED", EXPIRED: "EXPIRED",
  };

  const offers = orders.map((o) => {
    const price     = Number(o.pricePerUnit);
    const basePrice = basePriceMap.get(o.product.id) ?? price;
    return {
      id:           o.id,
      productId:    o.product.id,
      productName:  o.product.nameUa,
      productUnit:  o.product.unit,
      productIcon:  null,
      basePrice,
      cityName:     "Україна",
      price,
      quantity:     o.quantityTotal,
      qtySold:      o.quantityFilled,
      qtyRemaining: o.quantityTotal - o.quantityFilled,
      minOrder:     1,
      quality:      o.quality ?? 7.0,
      status:       uaStatuses[o.status] ?? o.status,
      expiresAt:    o.expiresAt.toISOString(),
      createdAt:    o.createdAt.toISOString(),
      priceVsBase:  basePrice > 0 ? price / basePrice : 1,
      revenue:      revenueMap.get(o.id) ?? 0,
    };
  });

  return NextResponse.json({ offers });
}
