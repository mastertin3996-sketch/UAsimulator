import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [tenders, tick] = await Promise.all([
    prisma.tender.findMany({
      where:   { status: "OPEN" },
      orderBy: { expiresAtTick: "asc" },
      include: { product: { select: { sku: true, nameUa: true, unit: true } } },
    }),
    prisma.gameTick.findFirst({ orderBy: { tickNumber: "desc" }, select: { tickNumber: true } }),
  ]);

  const currentTick = Number(tick?.tickNumber ?? 0n);

  return NextResponse.json({
    tenders: tenders.map(t => ({
      id:               t.id,
      title:            t.title,
      sku:              t.product.sku,
      productName:      t.product.nameUa,
      unit:             t.product.unit,
      quantityRequired: t.quantityRequired,
      pricePerUnit:     Number(t.pricePerUnitUah),
      expiresAtTick:    Number(t.expiresAtTick),
      ticksLeft:        Number(t.expiresAtTick) - currentTick,
      status:           t.status,
    })),
    currentTick,
  });
}
