import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;

  const [sellerRaw, buyerRaw] = await Promise.all([
    prisma.autoContract.findMany({
      where: { sellerId: playerId },
      include: { buyer: { select: { id: true, companyName: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.autoContract.findMany({
      where: { buyerId: playerId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Get seller info for buyer contracts
  const sellerIds = buyerRaw.map((c) => c.sellerId).filter((id): id is string => !!id);
  const sellers   = await prisma.player.findMany({
    where: { id: { in: sellerIds } },
    select: { id: true, companyName: true },
  });
  const sellerMap = new Map(sellers.map((s) => [s.id, s.companyName]));

  // Resolve products from resourceType (sku)
  const skus = [...new Set([...sellerRaw, ...buyerRaw].map((c) => c.resourceType))];
  const products = await prisma.product.findMany({
    where: { sku: { in: skus } },
    select: { sku: true, nameUa: true, unit: true },
  });
  const productMap = new Map(products.map((p) => [p.sku, p]));

  const npcPrices = await prisma.npcDemand.groupBy({
    by: ["productId"],
    _avg: { referencePrice: true },
  });
  const npcMap = new Map(npcPrices.map((n) => [n.productId, Number(n._avg.referencePrice ?? 0)]));

  function toRow(c: typeof sellerRaw[number] | typeof buyerRaw[number], isSeller: boolean) {
    const prod = productMap.get(c.resourceType);
    const buyer = "buyer" in c ? (c as typeof sellerRaw[number]).buyer : null;
    return {
      id:               c.id,
      status:           c.isActive ? "ACTIVE" : "PAUSED",
      productName:      prod?.nameUa ?? c.resourceType,
      productUnit:      prod?.unit ?? "шт",
      basePrice:        0,
      qtyPerTick:       c.quantityPerTick,
      pricePerUnit:     Number(c.maxPricePerUnit),
      quality:          c.minQuality,
      durationTicks:    null,
      executedTicks:    Number(c.lastExecutedTick ?? 0),
      expiresAt:        null,
      createdAt:        c.createdAt.toISOString(),
      lastExecutedAt:   c.lastExecutedTick ? new Date().toISOString() : null,
      sellerCompanyName: isSeller ? "Ви" : (sellerMap.get(c.sellerId ?? "") ?? "Ринок"),
      buyerCompanyName: isSeller ? (buyer?.companyName ?? null) : "Ви",
      sellerEntName:    "—",
      sellerCity:       "Україна",
      buyerEntName:     null,
      buyerCity:        null,
      recentExecs:      [],
      lifetimePaid:     Number(c.totalSpentUah),
      lifetimeQty:      c.lastFilledQty,
      execCount:        0,
    };
  }

  return NextResponse.json({
    sellerContracts: sellerRaw.map((c) => toRow(c, true)),
    buyerContracts:  buyerRaw.map((c) => toRow(c, false)),
  });
}
