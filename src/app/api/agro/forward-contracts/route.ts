/**
 * GET  /api/agro/forward-contracts        — список активних ф'ючерсів гравця
 * POST /api/agro/forward-contracts        — створити ф'ючерс
 * DEL  /api/agro/forward-contracts/[id]  — скасувати (зі штрафом)
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AgroService } from "@/engine/AgroService";
import { Decimal } from "@prisma/client/runtime/library";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contracts = await prisma.grainForwardContract.findMany({
    where:   { playerId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: {
      enterprise: { select: { name: true } },
      product:    { select: { nameUa: true, unit: true, sku: true } },
    },
    take: 50,
  });

  return NextResponse.json(contracts.map(c => ({
    id:            c.id,
    enterpriseName: c.enterprise.name,
    productNameUa: c.product.nameUa,
    productUnit:   c.product.unit,
    productSku:    c.product.sku,
    quantityUnits: c.quantityUnits,
    pricePerUnit:  Number(c.pricePerUnit),
    totalValue:    c.quantityUnits * Number(c.pricePerUnit),
    createdAtTick: Number(c.createdAtTick),
    deliveryTick:  Number(c.deliveryTick),
    status:        c.status,
    penaltyPaid:   Number(c.penaltyPaid),
  })));
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { enterpriseId, productSku, quantityUnits, pricePerUnit, deliveryInTicks } = body as {
    enterpriseId: string; productSku: string;
    quantityUnits: number; pricePerUnit: number; deliveryInTicks: number;
  };

  if (!enterpriseId || !productSku || !quantityUnits || !pricePerUnit || !deliveryInTicks)
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  if (quantityUnits <= 0 || pricePerUnit <= 0 || deliveryInTicks < 5 || deliveryInTicks > 120)
    return NextResponse.json({ error: "deliveryInTicks must be 5–120, qty/price > 0" }, { status: 400 });

  // Verify enterprise belongs to player and is AGRO_FARM
  const ent = await prisma.enterprise.findFirst({
    where: { id: enterpriseId, playerId: session.user.id, type: "AGRO_FARM" },
    select: { id: true },
  });
  if (!ent) return NextResponse.json({ error: "AGRO_FARM enterprise not found" }, { status: 404 });

  const product = await prisma.product.findUnique({ where: { sku: productSku }, select: { id: true } });
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const lastTick = await prisma.gameTick.findFirst({ orderBy: { tickNumber: "desc" }, select: { tickNumber: true } });
  const currentTick = lastTick ? Number(lastTick.tickNumber) : 1;
  const deliveryTick = currentTick + deliveryInTicks;

  const contract = await prisma.grainForwardContract.create({
    data: {
      playerId:      session.user.id,
      enterpriseId,
      productId:     product.id,
      quantityUnits,
      pricePerUnit:  new Decimal(pricePerUnit),
      createdAtTick: currentTick,
      deliveryTick,
      status:        "ACTIVE",
    },
    include: {
      product:    { select: { nameUa: true, unit: true } },
      enterprise: { select: { name: true } },
    },
  });

  return NextResponse.json({
    id:            contract.id,
    message:       `Ф'ючерс створено: ${contract.product.nameUa} × ${quantityUnits} за ₴${pricePerUnit}/${contract.product.unit}, поставка через ${deliveryInTicks} днів`,
    deliveryTick,
    totalValue:    quantityUnits * pricePerUnit,
  }, { status: 201 });
}
