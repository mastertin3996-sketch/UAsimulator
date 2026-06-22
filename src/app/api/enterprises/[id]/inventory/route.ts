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
  });
  if (!enterprise) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const items = await prisma.enterpriseInventory.findMany({
    where: { enterpriseId, quantity: { gt: 0 } },
    orderBy: { quantity: "desc" },
    include: { product: { select: { id: true, nameUa: true, unit: true } } },
  });

  return NextResponse.json({
    inventory: items.map((i) => ({
      productId: i.productId,
      product:   i.product.nameUa,
      unit:      i.product.unit,
      quantity:  i.quantity,
      quality:   i.avgQuality,
    })),
  });
}
