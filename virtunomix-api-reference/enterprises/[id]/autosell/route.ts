import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { productId, autoSellQty, autoSellPrice } = await req.json() as {
    productId    : string;
    autoSellQty  : number;
    autoSellPrice: number | null;
  };

  if (!productId || autoSellQty === undefined) {
    return NextResponse.json({ error: "productId, autoSellQty — обов'язкові" }, { status: 400 });
  }
  if (autoSellQty < 0) {
    return NextResponse.json({ error: "autoSellQty не може бути від'ємним" }, { status: 400 });
  }

  const enterprise = await prisma.enterprise.findUnique({
    where: { id },
    include: { company: { select: { ownerId: true } } },
  });
  if (!enterprise) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  if (enterprise.company.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });
  }

  const inv = await prisma.inventory.findFirst({
    where: { ownerType: "enterprise", enterpriseId: id, productId },
  });
  if (!inv) return NextResponse.json({ error: "Товар не знайдено на складі" }, { status: 404 });

  const updated = await prisma.inventory.update({
    where: { id: inv.id },
    data: {
      autoSellQty,
      autoSellPrice: autoSellPrice ?? null,
    },
  });

  return NextResponse.json({ ok: true, autoSellQty: Number(updated.autoSellQty), autoSellPrice: updated.autoSellPrice ? Number(updated.autoSellPrice) : null });
}
