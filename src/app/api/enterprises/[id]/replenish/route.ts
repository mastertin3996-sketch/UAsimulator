import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId     = session.user.id;
  const { id: enterpriseId } = await params;
  const body = await req.json().catch(() => ({})) as {
    productId?:      string;
    isActive?:       boolean;
    minStockTicks?:  number;
    maxPricePerUnit?: number;
  };

  if (!body.productId || !body.maxPricePerUnit) {
    return NextResponse.json({ error: "Потрібен productId та maxPricePerUnit" }, { status: 400 });
  }

  // Verify ownership
  const enterprise = await prisma.enterprise.findFirst({
    where: { id: enterpriseId, playerId },
    select: { id: true },
  });
  if (!enterprise) return NextResponse.json({ error: "Підприємство не знайдено" }, { status: 404 });

  // Verify product exists
  const product = await prisma.product.findUnique({ where: { id: body.productId }, select: { id: true } });
  if (!product) return NextResponse.json({ error: "Продукт не знайдено" }, { status: 404 });

  const rule = await prisma.replenishRule.upsert({
    where: { enterpriseId_productId: { enterpriseId, productId: body.productId } },
    create: {
      playerId,
      enterpriseId,
      productId:       body.productId,
      isActive:        body.isActive ?? true,
      minStockTicks:   body.minStockTicks ?? 3,
      maxPricePerUnit: body.maxPricePerUnit,
    },
    update: {
      isActive:        body.isActive ?? true,
      minStockTicks:   body.minStockTicks ?? 3,
      maxPricePerUnit: body.maxPricePerUnit,
    },
  });

  return NextResponse.json({ ok: true, ruleId: rule.id });
}
