import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/market/order  — list player's own open orders
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const playerId = session.user.id;

  const orders = await prisma.marketOrder.findMany({
    where:   { playerId, status: { in: ["OPEN", "PARTIALLY_FILLED"] } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, type: true, status: true,
      pricePerUnit: true, qualityMin: true,
      quantityTotal: true, quantityFilled: true,
      resourceType: true,
      expiresAt: true, createdAt: true,
      product: { select: { nameUa: true, unit: true } },
    },
  });

  return NextResponse.json({
    orders: orders.map((o) => ({
      id:             o.id,
      type:           o.type,
      status:         o.status,
      productName:    o.product.nameUa,
      unit:           o.product.unit,
      price:          Number(o.pricePerUnit),
      qualityMin:     o.qualityMin,
      quantityTotal:  Number(o.quantityTotal),
      quantityFilled: Number(o.quantityFilled),
      expiresAt:      o.expiresAt.toISOString(),
      createdAt:      o.createdAt.toISOString(),
    })),
  });
}

// DELETE /api/market/order?id=xxx  — cancel an open order
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const playerId = session.user.id;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const order = await prisma.marketOrder.findFirst({
    where: { id, playerId, status: { in: ["OPEN", "PARTIALLY_FILLED"] } },
    select: { id: true },
  });
  if (!order) return NextResponse.json({ error: "Ордер не знайдено або вже виконано" }, { status: 404 });

  await prisma.marketOrder.update({
    where: { id },
    data:  { status: "CANCELLED" },
  });

  return NextResponse.json({ ok: true });
}

// POST /api/market/order  — place a BUY limit order
// Body: { productId, quantity, price, qualityMin?, daysValid? }
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;
  const body     = await req.json();
  const { productId, quantity, price, qualityMin = 0, daysValid = 7 } = body;

  if (!productId || !quantity || !price) {
    return NextResponse.json({ error: "Заповніть всі обов'язкові поля" }, { status: 400 });
  }
  if (Number(price) <= 0 || Number(quantity) <= 0) {
    return NextResponse.json({ error: "Ціна та кількість мають бути > 0" }, { status: 400 });
  }

  const product = await prisma.product.findUnique({
    where: { id: productId }, select: { id: true, sku: true, nameUa: true },
  });
  if (!product) return NextResponse.json({ error: "Продукт не знайдено" }, { status: 404 });

  // Soft balance check — engine re-checks at match time
  const player = await prisma.player.findUnique({
    where: { id: playerId }, select: { cashBalance: true, isActive: true, isBankrupt: true },
  });
  if (!player || !player.isActive || player.isBankrupt) {
    return NextResponse.json({ error: "Акаунт заблоковано або банкрут" }, { status: 403 });
  }
  const maxCost = Number(quantity) * Number(price);
  if (Number(player.cashBalance) < maxCost) {
    return NextResponse.json({ error: `Недостатньо коштів (потрібно ≤ ₴${maxCost.toFixed(0)})` }, { status: 400 });
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + Math.max(1, Math.min(30, Number(daysValid))));

  const order = await prisma.marketOrder.create({
    data: {
      playerId,
      productId,
      resourceType: product.sku,
      type:         "BUY",
      status:       "OPEN",
      pricePerUnit: Number(price),
      qualityMin:   Number(qualityMin),
      quantityTotal: Number(quantity),
      quantityFilled: 0,
      expiresAt,
    },
    select: { id: true },
  });

  return NextResponse.json({ orderId: order.id }, { status: 201 });
}
