import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NPC_COMPANY_ID } from "@/lib/npc-config";
import { TransactionType } from "@/generated/prisma/client";

// POST /api/market/buy — купівля партії товару на B2B ринку
// Body: { offerId, quantity, buyerEnterpriseId }
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { offerId, quantity, buyerEnterpriseId } = await req.json() as {
    offerId: string;
    quantity: number;
    buyerEnterpriseId: string;
  };

  if (!offerId || !quantity || !buyerEnterpriseId) {
    return NextResponse.json(
      { error: "offerId, quantity, buyerEnterpriseId — обов'язкові" },
      { status: 400 },
    );
  }
  if (quantity <= 0) {
    return NextResponse.json({ error: "Кількість має бути > 0" }, { status: 400 });
  }

  // ── Завантажуємо все необхідне ──────────────────────────────────────────

  const [offer, buyerEnterprise, buyerWallet] = await Promise.all([
    prisma.marketOffer.findUnique({
      where: { id: offerId },
      include: {
        sellerCompany: { select: { id: true, ownerId: true } },
        product: { select: { name: true, unit: true } },
      },
    }),
    prisma.enterprise.findUnique({
      where: { id: buyerEnterpriseId },
      include: { company: { select: { id: true, ownerId: true } } },
    }),
    prisma.userWallet.findUnique({ where: { userId: session.user.id } }),
  ]);

  // ── Валідації ────────────────────────────────────────────────────────────

  if (!offer || offer.status !== "ACTIVE") {
    return NextResponse.json({ error: "Пропозиція не знайдена або вже закрита" }, { status: 404 });
  }
  if (offer.expiresAt < new Date()) {
    return NextResponse.json({ error: "Термін дії пропозиції вичерпано" }, { status: 410 });
  }
  if (!buyerEnterprise) {
    return NextResponse.json({ error: "Підприємство-покупець не знайдено" }, { status: 404 });
  }
  if (buyerEnterprise.company.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Підприємство не належить вам" }, { status: 403 });
  }
  const isNpcSeller = offer.sellerCompany.id === NPC_COMPANY_ID;

  if (!isNpcSeller && offer.sellerCompany.ownerId === session.user.id) {
    return NextResponse.json({ error: "Не можна купувати у самого себе" }, { status: 400 });
  }

  const offerQty      = Number(offer.quantity);
  const minOrder      = Number(offer.minOrder);
  const pricePerUnit  = Number(offer.price);
  const totalPrice    = pricePerUnit * quantity;

  if (quantity < minOrder) {
    return NextResponse.json(
      { error: `Мінімальне замовлення: ${minOrder} ${offer.product.unit}` },
      { status: 400 },
    );
  }
  if (quantity > offerQty) {
    return NextResponse.json(
      { error: `Доступно лише ${offerQty} ${offer.product.unit}` },
      { status: 400 },
    );
  }

  const buyerBalance = Number(buyerWallet?.gameCash ?? 0);
  if (buyerBalance < totalPrice) {
    return NextResponse.json(
      { error: `Недостатньо GC. Потрібно: ${totalPrice.toLocaleString("uk-UA")} GC, є: ${buyerBalance.toLocaleString("uk-UA")} GC` },
      { status: 400 },
    );
  }

  // ── Перевірка складу продавця (тільки для реальних гравців) ──────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sellerInv: any = null;
  if (!isNpcSeller) {
    sellerInv = await prisma.inventory.findFirst({
      where: {
        ownerType: "enterprise",
        productId: offer.productId,
        enterprise: { companyId: offer.sellerCompany.id },
      },
    });
    const sellerAvail = Number(sellerInv?.quantity ?? 0) - Number(sellerInv?.reservedQty ?? 0);
    if (sellerAvail < quantity) {
      return NextResponse.json(
        { error: `Продавець не має достатньо товару (доступно: ${sellerAvail})` },
        { status: 409 },
      );
    }
  }

  // ── Транзакція ───────────────────────────────────────────────────────────

  const remainingQty = offerQty - quantity;
  const newStatus    = remainingQty <= 0 ? "FILLED" : "ACTIVE";

  const buyerUserId  = session.user!.id;
  const sellerUserId = offer.sellerCompany.ownerId;
  const sellerWallet = await prisma.userWallet.findUnique({ where: { userId: sellerUserId } });

  await prisma.$transaction(async (tx) => {
    // 1. Гроші: мінус у покупця; продавцю — тільки якщо не NPC (NPC = game sink)
    await tx.userWallet.update({
      where: { userId: buyerUserId },
      data: { gameCash: { decrement: totalPrice } },
    });
    if (!isNpcSeller) {
      await tx.userWallet.update({
        where: { userId: sellerUserId },
        data: { gameCash: { increment: totalPrice } },
      });
    }

    // 2. Оновлюємо склад продавця (тільки для реальних гравців)
    if (sellerInv) {
      await tx.inventory.update({
        where: { id: sellerInv.id },
        data: {
          quantity:    { decrement: quantity },
          reservedQty: { decrement: quantity },
        },
      });
    }

    // 3. Зараховуємо товар на склад підприємства-покупця
    const qualityVal = Number(offer.quality);
    const existingBuyerInv = await tx.inventory.findFirst({
      where: { ownerType: "enterprise", enterpriseId: buyerEnterpriseId, productId: offer.productId },
    });
    if (existingBuyerInv) {
      // Зважена середня якість і собівартість
      const oldQty  = Number(existingBuyerInv.quantity);
      const newQty  = oldQty + quantity;
      const avgQuality = (Number(existingBuyerInv.quality) * oldQty + qualityVal * quantity) / newQty;
      const avgCost    = (Number(existingBuyerInv.avgCost) * oldQty + pricePerUnit * quantity) / newQty;

      await tx.inventory.update({
        where: { id: existingBuyerInv.id },
        data: { quantity: newQty, quality: avgQuality, avgCost },
      });
    } else {
      await tx.inventory.create({
        data: {
          ownerType:    "enterprise",
          enterpriseId: buyerEnterpriseId,
          productId:    offer.productId,
          quantity,
          quality:      qualityVal,
          avgCost:      pricePerUnit,
        },
      });
    }

    // 4. Оновлюємо пропозицію
    await tx.marketOffer.update({
      where: { id: offerId },
      data: { quantity: remainingQty, status: newStatus },
    });

    // 5. Запис транзакції на ринку
    await tx.marketTransaction.create({
      data: {
        offerId,
        buyerCompanyId:  buyerEnterprise.company.id,
        sellerCompanyId: offer.sellerCompany.id,
        quantity,
        pricePerUnit,
        totalPrice,
      },
    });

    // 6. Фінансові записи
    const buyerBalanceAfter  = buyerBalance - totalPrice;
    const sellerBalanceAfter = Number(sellerWallet?.gameCash ?? 0) + totalPrice;

    await tx.financialTransaction.create({
      data: {
        companyId   : buyerEnterprise.company.id,
        type        : TransactionType.MARKET_PURCHASE,
        amount      : -totalPrice,
        balanceAfter: buyerBalanceAfter,
        description : `Купівля ${quantity} ${offer.product.unit} «${offer.product.name}» по ${pricePerUnit} GC`,
      },
    });
    // Не логуємо продаж для NPC — це game sink
    if (!isNpcSeller) {
      await tx.financialTransaction.create({
        data: {
          companyId   : offer.sellerCompany.id,
          type        : TransactionType.MARKET_SALE,
          amount      : totalPrice,
          balanceAfter: sellerBalanceAfter,
          description : `Продаж ${quantity} ${offer.product.unit} «${offer.product.name}» по ${pricePerUnit} GC`,
        },
      });
    }
  }, { timeout: 20_000 });

  return NextResponse.json({
    success: true,
    purchased: {
      product: offer.product.name,
      quantity,
      pricePerUnit,
      totalPrice,
      deliveredTo: buyerEnterprise.name,
    },
  });
}
