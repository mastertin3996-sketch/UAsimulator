import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const deleteOrderQuerySchema = z.object({
  id: z.string().min(1),
});

const createOrderSchema = z.object({
  productId:  z.string().min(1),
  quantity:   z.number().finite().positive(),
  price:      z.number().finite().positive(),
  qualityMin: z.number().finite().optional().default(0),
  daysValid:  z.number().finite().optional().default(7),
});

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
  const { searchParams } = new URL(req.url);
  const parsedQuery = deleteOrderQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsedQuery.success) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { id } = parsedQuery.data;

  const order = await prisma.marketOrder.findFirst({
    where: { id, playerId, status: { in: ["OPEN", "PARTIALLY_FILLED"] } },
    select: { id: true, type: true, productId: true, quantityTotal: true, quantityFilled: true },
  });
  if (!order) return NextResponse.json({ error: "Ордер не знайдено або вже виконано" }, { status: 404 });

  await prisma.marketOrder.update({ where: { id }, data: { status: "CANCELLED" } });

  // Return unsold goods to first enterprise
  if (order.type === "SELL") {
    const remaining = order.quantityTotal - order.quantityFilled;
    if (remaining > 0.001) {
      await prisma.playerInventory.updateMany({
        where: { playerId, productId: order.productId },
        data:  { quantity: { decrement: remaining } },
      });
      const ent = await prisma.enterprise.findFirst({
        where: { playerId, isOperational: true }, select: { id: true }, orderBy: { id: "asc" },
      });
      if (ent) {
        await prisma.enterpriseInventory.upsert({
          where:  { enterpriseId_productId: { enterpriseId: ent.id, productId: order.productId } },
          update: { quantity: { increment: remaining } },
          create: { enterpriseId: ent.id, productId: order.productId, quantity: remaining, avgQuality: 7 },
        });
      }
    }
  }

  return NextResponse.json({ ok: true });
}

// POST /api/market/order  — place a BUY limit order
// Body: { productId, quantity, price, qualityMin?, daysValid? }
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;
  const rawBody = await req.json().catch(() => null);
  const parsed  = createOrderSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Заповніть всі обов'язкові поля (ціна та кількість мають бути > 0)" }, { status: 400 });
  }
  const { productId, quantity, price, qualityMin, daysValid } = parsed.data;

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
