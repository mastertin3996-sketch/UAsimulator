import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: enterpriseId } = await params;
  const playerId = session.user.id;

  const enterprise = await prisma.enterprise.findFirst({
    where: { id: enterpriseId, playerId },
    select: { id: true },
  });
  if (!enterprise) return NextResponse.json({ error: "Підприємство не знайдено" }, { status: 404 });

  const body = await req.json().catch(() => ({})) as {
    productId?:     string;
    autoSellQty?:   number;
    autoSellPrice?: number | null;
  };

  if (!body.productId) return NextResponse.json({ error: "productId обов'язковий" }, { status: 400 });

  const threshold = Math.max(0, Number(body.autoSellQty ?? 0));
  const price     = threshold > 0 && body.autoSellPrice != null && Number(body.autoSellPrice) > 0
    ? Number(body.autoSellPrice)
    : null;

  await prisma.enterpriseInventory.upsert({
    where:  { enterpriseId_productId: { enterpriseId, productId: body.productId } },
    update: { autoSellThreshold: threshold, autoSellPriceUah: price },
    create: {
      enterpriseId,
      productId:         body.productId,
      quantity:          0,
      avgQuality:        0,
      autoSellThreshold: threshold,
      autoSellPriceUah:  price,
    },
  });

  return NextResponse.json({ ok: true, autoSellQty: threshold, autoSellPrice: price });
}
