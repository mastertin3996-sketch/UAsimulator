import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

// PATCH — update price / minOrder
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const playerId = session.user.id;
  const { price, minOrder } = await req.json();

  const order = await prisma.marketOrder.findFirst({
    where: { id, playerId, type: "SELL", status: { in: ["OPEN", "PARTIALLY_FILLED"] } },
  });
  if (!order) return NextResponse.json({ error: "Оферту не знайдено" }, { status: 404 });

  await prisma.marketOrder.update({
    where: { id },
    data: { pricePerUnit: price ?? order.pricePerUnit },
  });

  return NextResponse.json({ price: price ?? Number(order.pricePerUnit), minOrder: minOrder ?? 1 });
}

// DELETE — cancel order (return inventory is complex; just mark cancelled)
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const playerId = session.user.id;

  const order = await prisma.marketOrder.findFirst({
    where: { id, playerId, type: "SELL", status: { in: ["OPEN", "PARTIALLY_FILLED"] } },
  });
  if (!order) return NextResponse.json({ error: "Оферту не знайдено" }, { status: 404 });

  // Return remaining quantity to player inventory (as PlayerInventory)
  const remaining = order.quantityTotal - order.quantityFilled;
  if (remaining > 0) {
    await prisma.playerInventory.upsert({
      where: { playerId_productId: { playerId, productId: order.productId } },
      update: { quantity: { increment: remaining } },
      create: { playerId, productId: order.productId, quantity: remaining, avgQuality: order.quality ?? 7.0 },
    });
  }

  await prisma.marketOrder.update({ where: { id }, data: { status: "CANCELLED" } });

  return NextResponse.json({ ok: true });
}
