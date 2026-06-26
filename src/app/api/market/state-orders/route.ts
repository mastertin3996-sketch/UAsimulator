import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orders = await prisma.marketOrder.findMany({
    where: { isStateOrder: true, status: { in: ["OPEN", "PARTIALLY_FILLED"] }, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, pricePerUnit: true, qualityMin: true,
      quantityTotal: true, quantityFilled: true, expiresAt: true,
      resourceType: true,
      product: { select: { id: true, nameUa: true, unit: true } },
    },
  });

  // Середня ринкова ціна для кожного продукту
  const productIds = orders.map(o => o.product.id);
  const npcPrices = await prisma.npcDemand.groupBy({
    by: ["productId"],
    where: { productId: { in: productIds } },
    _avg: { referencePrice: true },
  });
  const refPriceMap = new Map(npcPrices.map(n => [n.productId, Number(n._avg.referencePrice ?? 0)]));

  const result = orders.map(o => {
    const price    = Number(o.pricePerUnit);
    const refPrice = refPriceMap.get(o.product.id) ?? price;
    return {
      id:            o.id,
      productId:     o.product.id,
      productName:   o.product.nameUa,
      unit:          o.product.unit,
      resourceType:  o.resourceType,
      price,
      refPrice,
      premium:       refPrice > 0 ? ((price / refPrice - 1) * 100).toFixed(0) : "0",
      qualityMin:    o.qualityMin ?? 6,
      quantityTotal: o.quantityTotal,
      quantityLeft:  o.quantityTotal - o.quantityFilled,
      expiresAt:     o.expiresAt.toISOString(),
    };
  });

  return NextResponse.json({ orders: result });
}
