import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET — list OPEN sell orders
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orders = await prisma.marketOrder.findMany({
    where: { type: "SELL", status: { in: ["OPEN", "PARTIALLY_FILLED"] }, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true, pricePerUnit: true, quality: true,
      quantityTotal: true, quantityFilled: true, expiresAt: true,
      resourceType: true,
      product: { select: { id: true, nameUa: true, unit: true } },
      player: { select: { id: true, username: true, reputationScore: true } },
    },
  });

  // Get base prices from NpcDemand (product-level reference price, averaged over cities)
  const productIds = [...new Set(orders.map((o) => o.product.id))];
  const npcPrices = await prisma.npcDemand.groupBy({
    by: ["productId"],
    where: { productId: { in: productIds } },
    _avg: { referencePrice: true },
  });
  const basePriceMap = new Map(npcPrices.map((n) => [n.productId, Number(n._avg.referencePrice ?? 0)]));

  const offers = orders.map((o) => {
    const price     = Number(o.pricePerUnit);
    const basePrice = basePriceMap.get(o.product.id) ?? price;
    return {
      id:            o.id,
      productName:   o.product.nameUa,
      unit:          o.product.unit,
      basePrice,
      cityName:      "Україна",
      sellerName:    o.player.username,
      sellerRating:  o.player.reputationScore,
      price,
      quantity:      o.quantityTotal - o.quantityFilled,
      minOrder:      1,
      quality:       o.quality ?? 7.0,
      expiresAt:     o.expiresAt.toISOString(),
      priceVsBase:   basePrice > 0 ? price / basePrice : 1,
      isNpc:         false,
    };
  });

  return NextResponse.json({ offers });
}

// POST — create SELL order
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;
  const body     = await req.json();
  const { enterpriseId, productId, quantity, price, minOrder, daysValid } = body;

  if (!enterpriseId || !productId || !quantity || !price) {
    return NextResponse.json({ error: "Заповніть всі обов'язкові поля" }, { status: 400 });
  }

  // Verify enterprise belongs to player
  const enterprise = await prisma.enterprise.findFirst({
    where: { id: enterpriseId, playerId },
  });
  if (!enterprise) return NextResponse.json({ error: "Підприємство не знайдено" }, { status: 404 });

  // Check inventory
  const inv = await prisma.enterpriseInventory.findUnique({
    where: { enterpriseId_productId: { enterpriseId, productId } },
    include: { product: { select: { sku: true, nameUa: true, unit: true } } },
  });
  if (!inv || inv.quantity < quantity) {
    return NextResponse.json({ error: `Недостатньо товару (є ${inv?.quantity ?? 0})` }, { status: 400 });
  }

  // Deduct from enterprise inventory
  await prisma.enterpriseInventory.update({
    where: { enterpriseId_productId: { enterpriseId, productId } },
    data: { quantity: { decrement: quantity } },
  });

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + Math.max(1, Math.min(30, daysValid ?? 7)));

  const order = await prisma.marketOrder.create({
    data: {
      playerId,
      productId,
      resourceType: inv.product.sku,
      type: "SELL",
      status: "OPEN",
      pricePerUnit: price,
      quality: inv.avgQuality,
      quantityTotal: quantity,
      quantityFilled: 0,
      expiresAt,
    },
    select: { id: true },
  });

  return NextResponse.json({ orderId: order.id }, { status: 201 });
}
