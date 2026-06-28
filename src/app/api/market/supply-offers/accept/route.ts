import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const buyerId = session.user.id;

  const { offerId } = await req.json().catch(() => ({})) as { offerId?: string };
  if (!offerId) return NextResponse.json({ error: "offerId required" }, { status: 400 });

  const offer = await prisma.supplyOffer.findFirst({
    where: { id: offerId, isActive: true },
  });
  if (!offer) return NextResponse.json({ error: "Пропозицію не знайдено" }, { status: 404 });
  if (offer.sellerId === buyerId)
    return NextResponse.json({ error: "Не можна прийняти власну пропозицію" }, { status: 400 });

  // Check if buyer already has an AutoContract with this seller for this product
  const existing = await prisma.autoContract.findFirst({
    where: { buyerId, sellerId: offer.sellerId, resourceType: offer.productSku, isActive: true },
  });
  if (existing) return NextResponse.json({ error: "Контракт з цим продавцем вже існує" }, { status: 400 });

  const [contract] = await prisma.$transaction([
    prisma.autoContract.create({
      data: {
        buyerId,
        sellerId:        offer.sellerId,
        resourceType:    offer.productSku,
        maxPricePerUnit: offer.pricePerUnit,
        minQuality:      offer.minQuality,
        quantityPerTick: offer.quantityPerTick,
      },
    }),
    prisma.supplyOffer.update({
      where: { id: offerId },
      data:  { acceptedByCount: { increment: 1 } },
    }),
  ]);

  return NextResponse.json({ ok: true, contractId: contract.id });
}
