import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const buyOrderSchema = z.object({
  offerId:           z.string().min(1),
  quantity:          z.number().finite().positive(),
  buyerEnterpriseId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const buyerId = session.user.id;
  const rawBody = await req.json().catch(() => null);
  const parsed  = buyOrderSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Невірні параметри" }, { status: 400 });
  }
  const { offerId, quantity, buyerEnterpriseId } = parsed.data;

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

  const result = await prisma.$transaction(async (tx) => {
    // Re-check + claim the fill atomically: only proceeds if quantityFilled hasn't
    // moved since we read it above (guards against two concurrent buyers overselling
    // the same SELL order — see order.quantityFilled read at the top of this route).
    const claimed = await tx.marketOrder.updateMany({
      where: { id: offerId, quantityFilled: order.quantityFilled },
      data: { quantityFilled: newFilled, status: newStatus, filledAt: newStatus === "FILLED" ? new Date() : undefined },
    });
    if (claimed.count === 0) return null;

    await tx.player.update({ where: { id: buyerId }, data: { cashBalance: { decrement: totalCost } } });
    await tx.player.update({ where: { id: order.playerId }, data: { cashBalance: { increment: totalCost } } });

    // Release the seller's escrowed inventory (was moved here at SELL-order creation time)
    await tx.playerInventory.update({
      where: { playerId_productId: { playerId: order.playerId, productId: order.productId } },
      data: { quantity: { decrement: quantity } },
    });

    // Add to buyer enterprise inventory
    await tx.enterpriseInventory.upsert({
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
    });

    // Buyer financial transaction
    await tx.financialTransaction.create({
      data: {
        playerId: buyerId,
        type: "MARKET_PURCHASE",
        amountUah: -totalCost,
        balanceBefore: Number(buyer.cashBalance),
        balanceAfter: Number(buyer.cashBalance) - totalCost,
        description: `Купівля ${quantity} ${order.product.unit} ${order.product.nameUa}`,
      },
    });
    // Seller financial transaction
    await tx.financialTransaction.create({
      data: {
        playerId: order.playerId,
        type: "MARKET_SALE",
        amountUah: totalCost,
        balanceBefore: Number(order.player.cashBalance),
        balanceAfter: Number(order.player.cashBalance) + totalCost,
        description: `Продаж ${quantity} ${order.product.unit} ${order.product.nameUa}`,
      },
    });

    return true;
  });

  if (!result) {
    return NextResponse.json({ error: "Пропозицію щойно змінено іншою угодою, спробуйте ще раз" }, { status: 409 });
  }

  return NextResponse.json({ ok: true, quantity, totalCostUah: totalCost });
}
