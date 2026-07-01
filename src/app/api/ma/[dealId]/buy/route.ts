import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { allowRate } from "@/lib/rateLimit";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ dealId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const buyerId = session.user.id;
  const { dealId } = await params;

  if (!allowRate(`ma-buy:${buyerId}`, 3000)) {
    return NextResponse.json({ error: "Забагато запитів — спробуйте за кілька секунд" }, { status: 429 });
  }

  const lastTick = await prisma.gameTick.findFirst({ orderBy: { tickNumber: "desc" }, select: { tickNumber: true } });
  const currentTick = lastTick?.tickNumber ?? 1n;

  try {
    await prisma.$transaction(async (tx) => {
      const deal = await tx.maDeal.findUnique({ where: { id: dealId } });
      if (!deal)             throw new Error("Угода не знайдена");
      if (deal.status !== "PENDING") throw new Error("Угода вже не активна");
      if (deal.sellerId === buyerId) throw new Error("Не можна купити власну угоду");

      const price = new Prisma.Decimal(deal.transactionAmountUah.toString());

      // Buyer balance check
      const buyer = await tx.player.findUniqueOrThrow({
        where:  { id: buyerId },
        select: { cashBalance: true },
      });
      const buyerBal = new Prisma.Decimal(buyer.cashBalance.toString());
      if (buyerBal.lessThan(price)) {
        throw new Error(`Недостатньо коштів: потрібно ₴${price.toFixed(0)}, є ₴${buyerBal.toFixed(0)}`);
      }

      // Seller check
      const seller = await tx.player.findUniqueOrThrow({
        where:  { id: deal.sellerId },
        select: { cashBalance: true },
      });
      const sellerBal = new Prisma.Decimal(seller.cashBalance.toString());

      // Transfer enterprise(s)
      if (deal.targetEnterpriseId) {
        // Single enterprise sale
        const ent = await tx.enterprise.findUnique({ where: { id: deal.targetEnterpriseId } });
        if (!ent || ent.playerId !== deal.sellerId) {
          throw new Error("Підприємство більше не належить продавцю");
        }
        await tx.enterprise.update({
          where: { id: deal.targetEnterpriseId },
          data:  { playerId: buyerId },
        });
      } else {
        // Whole-company sale — transfer all seller's enterprises + land plots
        await tx.enterprise.updateMany({
          where: { playerId: deal.sellerId },
          data:  { playerId: buyerId },
        });
        await tx.landPlot.updateMany({
          where: { playerId: deal.sellerId },
          data:  { playerId: buyerId },
        });
      }

      // Deduct buyer
      const buyerBalAfter = buyerBal.minus(price);
      await tx.player.update({ where: { id: buyerId }, data: { cashBalance: buyerBalAfter } });
      await tx.financialTransaction.create({
        data: {
          playerId:      buyerId,
          type:          "MA_ACQUISITION_COST",
          amountUah:     price.negated(),
          balanceBefore: buyerBal,
          balanceAfter:  buyerBalAfter,
          description:   `M&A: придбання ${deal.targetEnterpriseId ? "підприємства" : "компанії"}`,
          referenceId:   dealId,
        },
      });

      // Credit seller
      const sellerBalAfter = sellerBal.plus(price);
      await tx.player.update({ where: { id: deal.sellerId }, data: { cashBalance: sellerBalAfter } });
      await tx.financialTransaction.create({
        data: {
          playerId:      deal.sellerId,
          type:          "MA_SALE_REVENUE",
          amountUah:     price,
          balanceBefore: sellerBal,
          balanceAfter:  sellerBalAfter,
          description:   `M&A: продаж ${deal.targetEnterpriseId ? "підприємства" : "компанії"}`,
          referenceId:   dealId,
        },
      });

      // Complete deal
      await tx.maDeal.update({
        where: { id: dealId },
        data: {
          buyerId, status: "COMPLETED", executedAtTick: currentTick,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Помилка";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
