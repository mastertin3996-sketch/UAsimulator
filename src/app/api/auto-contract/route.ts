import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const createAutoContractSchema = z.object({
  resourceType:    z.string().min(1),
  quantityPerTick: z.number().finite().positive(),
  maxPricePerUnit: z.number().finite().positive(),
  minQuality:      z.number().finite().optional(),
});

const updateAutoContractSchema = z.object({
  isActive:        z.boolean().optional(),
  quantityPerTick: z.number().finite().positive().optional(),
  maxPricePerUnit: z.number().finite().positive().optional(),
  minQuality:      z.number().finite().optional(),
});

// GET /api/auto-contract — list player's AutoContracts + product names
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const playerId = session.user.id;

  const [contracts, player] = await Promise.all([
    prisma.autoContract.findMany({
      where:   { buyerId: playerId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.player.findUnique({
      where:  { id: playerId },
      select: { cashBalance: true },
    }),
  ]);

  // Resolve product names via Product.sku
  const skus     = [...new Set(contracts.map((c) => c.resourceType))];
  const products = await prisma.product.findMany({
    where:  { sku: { in: skus } },
    select: { sku: true, nameUa: true, unit: true },
  });
  const prodMap = Object.fromEntries(products.map((p) => [p.sku, p]));

  const activeContracts = contracts.filter((c) => c.isActive);
  const committedPerTick = activeContracts.reduce(
    (s, c) => s + Number(c.maxPricePerUnit) * c.quantityPerTick,
    0,
  );

  return NextResponse.json({
    cashBalance:       Number(player?.cashBalance ?? 0),
    committedPerTick,
    contracts: contracts.map((c) => ({
      id:               c.id,
      resourceType:     c.resourceType,
      productName:      prodMap[c.resourceType]?.nameUa ?? c.resourceType,
      productUnit:      prodMap[c.resourceType]?.unit ?? "т",
      quantityPerTick:  c.quantityPerTick,
      maxPricePerUnit:  Number(c.maxPricePerUnit),
      minQuality:       c.minQuality,
      isActive:         c.isActive,
      lastFilledQty:    c.lastFilledQty,
      lastTickSpentUah: Number(c.lastTickSpentUah),
      totalSpentUah:    Number(c.totalSpentUah),
      lastExecutedTick: c.lastExecutedTick?.toString() ?? null,
    })),
  });
}

// POST /api/auto-contract — create
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const playerId = session.user.id;

  const rawBody = await req.json().catch(() => null);
  const parsed  = createAutoContractSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "resourceType, quantityPerTick та maxPricePerUnit обов'язкові (кількість і ціна > 0)" }, { status: 400 });
  }
  const body = parsed.data;

  // Verify product exists
  const product = await prisma.product.findFirst({ where: { sku: body.resourceType } });
  if (!product) return NextResponse.json({ error: "Товар не знайдено" }, { status: 404 });

  // Cap at 20 contracts per player
  const count = await prisma.autoContract.count({ where: { buyerId: playerId } });
  if (count >= 20) return NextResponse.json({ error: "Ліміт 20 авто-контрактів" }, { status: 400 });

  const contract = await prisma.autoContract.create({
    data: {
      buyerId:         playerId,
      resourceType:    body.resourceType,
      quantityPerTick: body.quantityPerTick,
      maxPricePerUnit: body.maxPricePerUnit,
      minQuality:      body.minQuality ?? 0,
    },
  });

  return NextResponse.json({ ok: true, id: contract.id });
}

// PATCH /api/auto-contract?id=xxx — toggle or update
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const playerId = session.user.id;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id обов'язковий" }, { status: 400 });

  const rawBody = await req.json().catch(() => null);
  const parsed  = updateAutoContractSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Некоректні дані оновлення" }, { status: 400 });
  }
  const body = parsed.data;

  const existing = await prisma.autoContract.findFirst({ where: { id, buyerId: playerId } });
  if (!existing) return NextResponse.json({ error: "Контракт не знайдено" }, { status: 404 });

  await prisma.autoContract.update({
    where: { id },
    data: {
      ...(body.isActive        !== undefined && { isActive:        body.isActive }),
      ...(body.quantityPerTick !== undefined && { quantityPerTick: body.quantityPerTick }),
      ...(body.maxPricePerUnit !== undefined && { maxPricePerUnit: body.maxPricePerUnit }),
      ...(body.minQuality      !== undefined && { minQuality:      body.minQuality }),
    },
  });

  return NextResponse.json({ ok: true });
}

// DELETE /api/auto-contract?id=xxx
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const playerId = session.user.id;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id обов'язковий" }, { status: 400 });

  const existing = await prisma.autoContract.findFirst({ where: { id, buyerId: playerId } });
  if (!existing) return NextResponse.json({ error: "Контракт не знайдено" }, { status: 404 });

  await prisma.autoContract.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
