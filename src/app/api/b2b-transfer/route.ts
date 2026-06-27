/**
 * GET /api/b2b-transfer — список B2B угод гравця
 * POST /api/b2b-transfer — створити угоду
 * DELETE /api/b2b-transfer?id=... — деактивувати угоду
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const agreements = await prisma.b2bTransferAgreement.findMany({
    where:   { playerId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true, isActive: true, quantityPerTick: true, pricePerUnit: true,
      totalTransferred: true, lastExecutedTick: true, createdAtTick: true,
      product:          { select: { sku: true, nameUa: true, unit: true } },
      sourceEnterprise: { select: { id: true, name: true, type: true } },
      targetEnterprise: { select: { id: true, name: true, type: true } },
    },
  });

  return NextResponse.json({
    agreements: agreements.map(a => ({
      ...a,
      pricePerUnit:     Number(a.pricePerUnit),
      lastExecutedTick: a.lastExecutedTick?.toString() ?? null,
      createdAtTick:    a.createdAtTick.toString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { sourceEnterpriseId, targetEnterpriseId, productSku, quantityPerTick, pricePerUnit } = body as {
    sourceEnterpriseId: string; targetEnterpriseId: string;
    productSku: string; quantityPerTick: number; pricePerUnit: number;
  };

  if (!sourceEnterpriseId || !targetEnterpriseId || !productSku || !quantityPerTick) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (sourceEnterpriseId === targetEnterpriseId) {
    return NextResponse.json({ error: "Джерело і ціль не можуть бути однаковими" }, { status: 400 });
  }

  // Validate both enterprises belong to player
  const [src, dst] = await Promise.all([
    prisma.enterprise.findFirst({ where: { id: sourceEnterpriseId, playerId: session.user.id }, select: { id: true, name: true } }),
    prisma.enterprise.findFirst({ where: { id: targetEnterpriseId, playerId: session.user.id }, select: { id: true, name: true } }),
  ]);
  if (!src) return NextResponse.json({ error: "Джерельне підприємство не знайдено" }, { status: 404 });
  if (!dst) return NextResponse.json({ error: "Цільове підприємство не знайдено" }, { status: 404 });

  const product = await prisma.product.findUnique({
    where: { sku: productSku }, select: { id: true, nameUa: true },
  });
  if (!product) return NextResponse.json({ error: "Товар не знайдено" }, { status: 404 });

  const currentTick = await prisma.gameTick.findFirst({
    orderBy: { tickNumber: "desc" }, select: { tickNumber: true },
  });
  const tick = BigInt(currentTick?.tickNumber ?? 0);

  const agreement = await prisma.b2bTransferAgreement.create({
    data: {
      playerId:           session.user.id,
      sourceEnterpriseId,
      targetEnterpriseId,
      productId:          product.id,
      quantityPerTick,
      pricePerUnit:       new Decimal(pricePerUnit ?? 0),
      createdAtTick:      tick,
    },
  });

  return NextResponse.json({
    message: `B2B угода створена: ${product.nameUa} × ${quantityPerTick}/день з ${src.name} → ${dst.name}`,
    id:      agreement.id,
  }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const agreement = await prisma.b2bTransferAgreement.findFirst({
    where: { id, playerId: session.user.id },
  });
  if (!agreement) return NextResponse.json({ error: "Угоду не знайдено" }, { status: 404 });

  await prisma.b2bTransferAgreement.update({
    where: { id },
    data:  { isActive: false },
  });

  return NextResponse.json({ message: "Угоду деактивовано" });
}
