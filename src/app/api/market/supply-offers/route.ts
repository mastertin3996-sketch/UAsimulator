import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const offers = await prisma.supplyOffer.findMany({
    where:   { isActive: true },
    orderBy: { createdAt: "desc" },
    include: { seller: { select: { companyName: true, reputationScore: true } } },
  });

  const skus     = [...new Set(offers.map(o => o.productSku))];
  const products = await prisma.product.findMany({
    where:  { sku: { in: skus } },
    select: { sku: true, nameUa: true, unit: true },
  });
  const prodMap = Object.fromEntries(products.map(p => [p.sku, p]));

  return NextResponse.json({
    offers: offers.map(o => ({
      id:              o.id,
      productSku:      o.productSku,
      productName:     prodMap[o.productSku]?.nameUa ?? o.productSku,
      unit:            prodMap[o.productSku]?.unit ?? "",
      pricePerUnit:    Number(o.pricePerUnit),
      quantityPerTick: o.quantityPerTick,
      minQuality:      o.minQuality,
      description:     o.description,
      acceptedByCount: o.acceptedByCount,
      sellerName:      o.seller.companyName,
      sellerRep:       o.seller.reputationScore,
      sellerId:        o.sellerId,
      isOwn:           o.sellerId === session.user!.id,
      createdAt:       o.createdAt,
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as {
    productSku?: string; pricePerUnit?: number; quantityPerTick?: number;
    minQuality?: number; description?: string;
  };
  if (!body.productSku || !body.pricePerUnit || !body.quantityPerTick)
    return NextResponse.json({ error: "productSku, pricePerUnit, quantityPerTick required" }, { status: 400 });

  const offer = await prisma.supplyOffer.create({
    data: {
      sellerId:        session.user.id,
      productSku:      body.productSku,
      pricePerUnit:    body.pricePerUnit,
      quantityPerTick: body.quantityPerTick,
      minQuality:      body.minQuality ?? 0,
      description:     body.description ?? "",
    },
  });

  return NextResponse.json({ ok: true, id: offer.id }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json().catch(() => ({})) as { id?: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.supplyOffer.updateMany({
    where: { id, sellerId: session.user.id },
    data:  { isActive: false },
  });

  return NextResponse.json({ ok: true });
}
