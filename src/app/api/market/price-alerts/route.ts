import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const alerts = await prisma.priceAlert.findMany({
    where:   { playerId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  const skus     = [...new Set(alerts.map(a => a.productSku))];
  const products = await prisma.product.findMany({
    where:  { sku: { in: skus } },
    select: { sku: true, nameUa: true, unit: true },
  });
  const prodMap = Object.fromEntries(products.map(p => [p.sku, p]));

  // Get current reference prices
  const prodIds = await prisma.product.findMany({
    where:  { sku: { in: skus } },
    select: { id: true, sku: true },
  });
  const prices = await prisma.npcDemand.groupBy({
    by: ['productId'],
    where: { productId: { in: prodIds.map(p => p.id) } },
    _avg: { referencePrice: true },
  });
  const priceById = new Map(prodIds.map(p => {
    const row = prices.find(r => r.productId === p.id);
    return [p.sku, Number(row?._avg.referencePrice ?? 0)];
  }));

  return NextResponse.json({
    alerts: alerts.map(a => ({
      id:           a.id,
      productSku:   a.productSku,
      productName:  prodMap[a.productSku]?.nameUa ?? a.productSku,
      unit:         prodMap[a.productSku]?.unit ?? "",
      alertBelow:   a.alertBelow ? Number(a.alertBelow) : null,
      alertAbove:   a.alertAbove ? Number(a.alertAbove) : null,
      isActive:     a.isActive,
      firedAt:      a.firedAt,
      currentPrice: priceById.get(a.productSku) ?? 0,
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as {
    productSku?: string; alertBelow?: number; alertAbove?: number;
  };
  if (!body.productSku) return NextResponse.json({ error: "productSku required" }, { status: 400 });
  if (!body.alertBelow && !body.alertAbove)
    return NextResponse.json({ error: "Вкажіть alertBelow або alertAbove" }, { status: 400 });

  const alert = await prisma.priceAlert.create({
    data: {
      playerId:   session.user.id,
      productSku: body.productSku,
      alertBelow: body.alertBelow ?? null,
      alertAbove: body.alertAbove ?? null,
    },
  });

  return NextResponse.json({ ok: true, id: alert.id }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json().catch(() => ({})) as { id?: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.priceAlert.deleteMany({
    where: { id, playerId: session.user.id },
  });

  return NextResponse.json({ ok: true });
}
