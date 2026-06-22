import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

async function getOwnedEnterprise(userId: string, enterpriseId: string) {
  const ent = await prisma.enterprise.findUnique({
    where: { id: enterpriseId },
    include: { company: { select: { ownerId: true } }, enterpriseType: { select: { category: true } } },
  });
  if (!ent) return null;
  if (ent.company.ownerId !== userId) return null;
  if (ent.enterpriseType.category !== "TRADE") return null;
  return ent;
}

// GET — list all showcase slots for this enterprise
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const ent = await getOwnedEnterprise(session.user.id, id);
  if (!ent) return NextResponse.json({ error: "Не знайдено або доступ заборонено" }, { status: 404 });

  const slots = await prisma.shopSetting.findMany({
    where: { enterpriseId: id },
    include: { product: { select: { id: true, name: true, unit: true, basePrice: true } } },
    orderBy: { id: "asc" },
  });

  return NextResponse.json({
    slots: slots.map((s) => ({
      id          : s.id,
      productId   : s.productId,
      product     : s.product,
      retailPrice : Number(s.retailPrice),
      markupPct   : Number(s.markupPct),
      displayLimit: s.displayLimit,
      isActive    : s.isActive,
    })),
  });
}

// POST — add a product to the showcase
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const ent = await getOwnedEnterprise(session.user.id, id);
  if (!ent) return NextResponse.json({ error: "Не знайдено або доступ заборонено" }, { status: 404 });

  const body = await req.json();
  const { productId, retailPrice, displayLimit = 0 } = body as {
    productId: string; retailPrice: number; displayLimit?: number;
  };

  if (!productId || !retailPrice || retailPrice <= 0) {
    return NextResponse.json({ error: "Потрібні productId та retailPrice > 0" }, { status: 400 });
  }

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return NextResponse.json({ error: "Товар не знайдено" }, { status: 404 });

  const markupPct = Number(product.basePrice) > 0
    ? ((retailPrice / Number(product.basePrice) - 1) * 100)
    : 0;

  const slot = await prisma.shopSetting.upsert({
    where: { enterpriseId_productId: { enterpriseId: id, productId } },
    update: { retailPrice, markupPct, displayLimit, isActive: true },
    create: { enterpriseId: id, productId, retailPrice, markupPct, displayLimit, isActive: true },
    include: { product: { select: { id: true, name: true, unit: true, basePrice: true } } },
  });

  return NextResponse.json({
    slot: {
      id          : slot.id,
      productId   : slot.productId,
      product     : slot.product,
      retailPrice : Number(slot.retailPrice),
      markupPct   : Number(slot.markupPct),
      displayLimit: slot.displayLimit,
      isActive    : slot.isActive,
    },
  });
}

// PATCH — update price/limit/active for a specific slot
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const ent = await getOwnedEnterprise(session.user.id, id);
  if (!ent) return NextResponse.json({ error: "Не знайдено або доступ заборонено" }, { status: 404 });

  const body = await req.json();
  const { slotId, retailPrice, displayLimit, isActive } = body as {
    slotId: string; retailPrice?: number; displayLimit?: number; isActive?: boolean;
  };

  if (!slotId) return NextResponse.json({ error: "Потрібен slotId" }, { status: 400 });

  const existing = await prisma.shopSetting.findFirst({ where: { id: slotId, enterpriseId: id } });
  if (!existing) return NextResponse.json({ error: "Слот не знайдено" }, { status: 404 });

  const updateData: Record<string, unknown> = {};
  if (retailPrice !== undefined && retailPrice > 0) {
    updateData.retailPrice = retailPrice;
    const product = await prisma.product.findUnique({ where: { id: existing.productId } });
    if (product && Number(product.basePrice) > 0) {
      updateData.markupPct = (retailPrice / Number(product.basePrice) - 1) * 100;
    }
  }
  if (displayLimit !== undefined) updateData.displayLimit = displayLimit;
  if (isActive !== undefined) updateData.isActive = isActive;

  const updated = await prisma.shopSetting.update({
    where: { id: slotId },
    data: updateData,
    include: { product: { select: { id: true, name: true, unit: true, basePrice: true } } },
  });

  return NextResponse.json({
    slot: {
      id          : updated.id,
      productId   : updated.productId,
      product     : updated.product,
      retailPrice : Number(updated.retailPrice),
      markupPct   : Number(updated.markupPct),
      displayLimit: updated.displayLimit,
      isActive    : updated.isActive,
    },
  });
}

// DELETE — remove a slot from the showcase
export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const ent = await getOwnedEnterprise(session.user.id, id);
  if (!ent) return NextResponse.json({ error: "Не знайдено або доступ заборонено" }, { status: 404 });

  const { slotId } = await req.json() as { slotId: string };
  if (!slotId) return NextResponse.json({ error: "Потрібен slotId" }, { status: 400 });

  await prisma.shopSetting.deleteMany({ where: { id: slotId, enterpriseId: id } });
  return NextResponse.json({ ok: true });
}
