import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: enterpriseId } = await params;
  const playerId = session.user.id;

  const enterprise = await prisma.enterprise.findFirst({
    where: { id: enterpriseId, playerId },
    select: {
      type: true,
      landPlot: { select: { city: { select: { id: true, nameUa: true } } } },
      inventory: { select: { productId: true, quantity: true, avgQuality: true } },
    },
  });
  if (!enterprise) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const cityId = enterprise.landPlot.city.id;

  const demands = await prisma.npcDemand.findMany({
    where: { cityId },
    orderBy: { baseUnitsPerDay: "desc" },
    select: {
      id: true,
      baseUnitsPerDay: true,
      referencePrice: true,
      product: { select: { id: true, sku: true, nameUa: true, unit: true } },
    },
  });

  const invMap = new Map(enterprise.inventory.map(i => [i.productId, { quantity: Number(i.quantity), avgQuality: i.avgQuality }]));

  const items = demands.map(d => ({
    productId:      d.product.id,
    sku:            d.product.sku,
    nameUa:         d.product.nameUa,
    unit:           d.product.unit,
    baseUnitsPerDay: d.baseUnitsPerDay,
    referencePrice: Number(d.referencePrice),
    inStock:        invMap.get(d.product.id)?.quantity ?? 0,
    avgQuality:     invMap.get(d.product.id)?.avgQuality ?? 0,
  }));

  return NextResponse.json({ cityName: enterprise.landPlot.city.nameUa, items });
}
