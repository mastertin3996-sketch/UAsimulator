import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

const autosellSchema = z.object({
  productId:     z.string().min(1),
  autoSellQty:   z.number().finite().optional(),
  autoSellPrice: z.number().finite().nullable().optional(),
});

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

  const rawBody = await req.json().catch(() => null);
  const parsed  = autosellSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "productId обов'язковий" }, { status: 400 });
  }
  const body = parsed.data;

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
