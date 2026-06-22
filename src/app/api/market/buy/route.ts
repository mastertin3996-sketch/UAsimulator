import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const buyerId = session.user.id;
  const { offerId, quantity, buyerEnterpriseId } = await req.json();

  if (!offerId || !quantity || !buyerEnterpriseId) {
    return NextResponse.json({ error: "Невірні параметри" }, { status: 400 });
  }

  // Verify buyer enterprise
  const buyerEnt = await prisma.enterprise.findFirst({
    where: { id: buyerEnterpriseId, playerId: buyerId },
  });
  if (!buyerEnt) return NextResponse.json({ error: "Підприємство не знайдено" }, { status: 404 });

  // Get the sell order
  const order = await prisma.marketOrder.findUnique({
    where: { id: offerId },
    include: { player: true, product: true },
  });

  if (!order || order.type !== "SELL" || !["OPEN", "PARTIALLY_FILLED"].includes(order.status)) {
    return NextResponse.json({ error: "Пропозиція не знайдена або вже закрита" }, { status: 404 });
  }
  if (order.expiresAt < new Date()) {
    return NextResponse.json({ error: "Пропозиція прострочена" }, { status: 400 });
  }
  if (order.playerId === buyerId) {
    return NextResponse.json({ error: "Не можна купити у себе" }, { status: 400 });
  }

  const available = order.quantityTotal - order.quantityFilled;
  if (quantity > available) {
    return NextResponse.json({ error: `Доступно лише ${available} одиниць` }, { status: 400 });
  }

  const totalCost = Number(order.pricePerUnit) * quantity;

  // Check buyer cash
  const buyer = await prisma.player.findUnique({ where: { id: buyerId }, select: { cashBalance: true } });
  if (!buyer || Number(buyer.cashBalance) < totalCost) {
    return NextResponse.json({ error: "Недостатньо коштів" }, { status: 400 });
  }

  const newFilled = order.quantityFilled + quantity;
  const newStatus = newFilled >= order.quantityTotal ? "FILLED" : "PARTIALLY_FILLED";

  await prisma.$transaction([
    // Deduct from buyer
    prisma.player.update({ where: { id: buyerId }, data: { cashBalance: { decrement: totalCost } } }),
    // Add to seller
    prisma.player.update({ where: { id: order.playerId }, data: { cashBalance: { increment: totalCost } } }),
    // Update order
    prisma.marketOrder.update({
      where: { id: offerId },
      data: { quantityFilled: newFilled, status: newStatus, filledAt: newStatus === "FILLED" ? new Date() : undefined },
    }),
    // Add to buyer enterprise inventory
    prisma.enterpriseInventory.upsert({
      where: { enterpriseId_productId: { enterpriseId: buyerEnterpriseId, productId: order.productId } },
      update: {
        quantity: { increment: quantity },
        avgQuality: order.quality ?? 7.0,
      },
      create: {
        enterpriseId: buyerEnterpriseId,
        productId: order.productId,
        quantity,
        avgQuality: order.quality ?? 7.0,
      },
    }),
    // Buyer financial transaction
    prisma.financialTransaction.create({
      data: {
        playerId: buyerId,
        type: "MARKET_PURCHASE",
        amountUah: -totalCost,
        balanceBefore: Number(buyer.cashBalance),
        balanceAfter: Number(buyer.cashBalance) - totalCost,
        description: `Купівля ${quantity} ${order.product.unit} ${order.product.nameUa}`,
      },
    }),
    // Seller financial transaction
    prisma.financialTransaction.create({
      data: {
        playerId: order.playerId,
        type: "MARKET_SALE",
        amountUah: totalCost,
        balanceBefore: Number(order.player.cashBalance),
        balanceAfter: Number(order.player.cashBalance) + totalCost,
        description: `Продаж ${quantity} ${order.product.unit} ${order.product.nameUa}`,
      },
    }),
  ]);

  return NextResponse.json({ ok: true, quantity, totalCostUah: totalCost });
}
