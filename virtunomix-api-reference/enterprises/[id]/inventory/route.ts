import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const enterprise = await prisma.enterprise.findUnique({
    where: { id },
    include: { company: { select: { ownerId: true } } },
  });
  if (!enterprise) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  if (enterprise.company.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });
  }

  const items = await prisma.inventory.findMany({
    where: { ownerType: "enterprise", enterpriseId: id, quantity: { gt: 0 } },
    include: { product: { select: { name: true, unit: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({
    inventory: items.map((i) => ({
      productId: i.productId,
      product  : i.product.name,
      unit     : i.product.unit,
      quantity : Number(i.quantity) - Number(i.reservedQty ?? 0),
    })),
  });
}
