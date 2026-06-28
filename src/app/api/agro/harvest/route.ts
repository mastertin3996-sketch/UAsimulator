import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const playerId = session.user.id;

  const { workshopId } = await req.json().catch(() => ({})) as { workshopId?: string };
  if (!workshopId) return NextResponse.json({ error: "workshopId required" }, { status: 400 });

  const ws = await prisma.workshop.findFirst({
    where: { id: workshopId, enterprise: { playerId } },
    select: {
      id: true,
      harvestAccumulated: true,
      enterprise: { select: { id: true } },
      productionOrders: {
        where: { status: "IN_PROGRESS" },
        select: { recipe: { select: { outputs: { select: { product: { select: { id: true, sku: true } }, quantityPerUnit: true } } } } },
        take: 1,
      },
    },
  });

  if (!ws) return NextResponse.json({ error: "Цех не знайдено" }, { status: 404 });
  if (ws.harvestAccumulated < 0.1) return NextResponse.json({ error: "Нема чого збирати" }, { status: 400 });

  const harvested = ws.harvestAccumulated;
  const output    = ws.productionOrders[0]?.recipe?.outputs?.[0];
  if (!output) return NextResponse.json({ error: "Рецепт не знайдено" }, { status: 400 });

  const enterpriseId = ws.enterprise.id;
  const productId    = output.product.id;

  const existing = await prisma.enterpriseInventory.findFirst({
    where: { enterpriseId, productId },
    select: { id: true, quantity: true, avgQuality: true },
  });

  await prisma.$transaction([
    existing
      ? prisma.enterpriseInventory.update({
          where: { id: existing.id },
          data:  { quantity: { increment: harvested } },
        })
      : prisma.enterpriseInventory.create({
          data: { enterpriseId, productId, quantity: harvested, avgQuality: 5 },
        }),
    prisma.workshop.update({
      where: { id: ws.id },
      data:  { harvestAccumulated: 0 },
    }),
  ]);

  return NextResponse.json({ ok: true, harvested, productSku: output.product.sku });
}
