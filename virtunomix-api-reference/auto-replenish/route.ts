import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/auto-replenish
// Returns all AutoReplenishRules across all enterprises of the company
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const company = await prisma.company.findFirst({
    where : { ownerId: session.user.id },
    select: { id: true },
  });
  if (!company) return NextResponse.json({ error: "No company" }, { status: 404 });

  const rules = await prisma.autoReplenishRule.findMany({
    where  : { enterprise: { companyId: company.id } },
    include: {
      enterprise: { select: { id: true, name: true } },
      product   : { select: { id: true, name: true, unit: true, basePrice: true } },
    },
    orderBy: [{ enterprise: { name: "asc" } }, { createdAt: "asc" }],
  });

  const entIds     = [...new Set(rules.map((r) => r.enterpriseId))];
  const productIds = [...new Set(rules.map((r) => r.productId))];

  // Current free inventory per (enterpriseId, productId)
  const inventories = entIds.length > 0 && productIds.length > 0
    ? await prisma.inventory.findMany({
        where: { ownerType: "ENTERPRISE", enterpriseId: { in: entIds }, productId: { in: productIds } },
        select: { enterpriseId: true, productId: true, quantity: true, reservedQty: true },
      })
    : [];
  const invKey = (eid: string, pid: string) => `${eid}:${pid}`;
  const invMap = new Map(inventories.map((i) => [invKey(i.enterpriseId ?? "", i.productId), Number(i.quantity) - Number(i.reservedQty)]));

  // Cheapest active market offer per product
  const marketAggs = productIds.length > 0
    ? await prisma.marketOffer.groupBy({
        by   : ["productId"],
        where: { productId: { in: productIds }, status: "ACTIVE" },
        _min : { price: true },
        _count: { id: true },
      })
    : [];
  const marketMap = new Map(marketAggs.map((m) => [m.productId, {
    minPrice   : Number(m._min.price ?? 0),
    offersCount: m._count.id,
  }]));

  return NextResponse.json({
    rules: rules.map((r) => {
      const mkt = marketMap.get(r.productId);
      return {
        id              : r.id,
        enterpriseId    : r.enterpriseId,
        enterpriseName  : r.enterprise.name,
        productId       : r.productId,
        productName     : r.product.name,
        productUnit     : r.product.unit,
        basePrice       : Number(r.product.basePrice),
        isActive        : r.isActive,
        minStockTicks   : r.minStockTicks,
        maxPricePerUnit : Number(r.maxPricePerUnit),
        lastTriggeredAt : r.lastTriggeredAt,
        currentQty      : invMap.get(invKey(r.enterpriseId, r.productId)) ?? 0,
        minMarketPrice  : mkt?.minPrice    ?? null,
        offersCount     : mkt?.offersCount ?? 0,
      };
    }),
  });
}
