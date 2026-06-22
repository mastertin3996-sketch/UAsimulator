import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ─── GET /api/analytics/price-history?productId=... ──────────────────────────
// Returns last 10 completed ticks of:
//   • avgRetailPrice   — weighted avg of retail prices in RetailSalesLog
//   • totalRetailSold  — total qty sold to NPC
//   • totalProduction  — total qty produced (from ProductionLog)
//   • avgWholesalePrice— avg active MarketOffer price at that tick (snapshot at tick end)
//
// Note: wholesale history is approximated from MarketTransactions transacted
// within that tick's window (between prev tick processedAt and this tick processedAt).

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const productId = req.nextUrl.searchParams.get("productId");
  if (!productId) return NextResponse.json({ error: "productId обов'язковий" }, { status: 400 });

  // Verify product exists
  const product = await prisma.product.findUnique({
    where : { id: productId },
    select: { id: true, name: true, unit: true, basePrice: true },
  });
  if (!product) return NextResponse.json({ error: "Продукт не знайдено" }, { status: 404 });

  // Last 10 completed ticks (chronological order)
  const ticks = await prisma.gameTick.findMany({
    where  : { status: "DONE" },
    orderBy: { tickNumber: "desc" },
    take   : 10,
    select : { id: true, tickNumber: true, processedAt: true },
  });

  if (ticks.length === 0) {
    return NextResponse.json({ product, history: [] });
  }

  const tickIds = ticks.map((t) => t.id);

  // Retail aggregation per tick
  const retailByTick = await prisma.retailSalesLog.groupBy({
    by   : ["tickId"],
    where: { productId, tickId: { in: tickIds } },
    _avg : { price: true, saturationIndex: true },
    _sum : { quantitySold: true },
  });

  // Production aggregation per tick
  const prodByTick = await prisma.productionLog.findMany({
    where : { productId, tickId: { in: tickIds } },
    select: { tickId: true, quantity: true, avgQuality: true },
  });

  // Wholesale: transactions involving this product, bucketed by tick time window
  // We join MarketTransaction → MarketOffer to get productId
  const ticksSorted = [...ticks].sort((a, b) => a.tickNumber - b.tickNumber);
  const wholesaleHistory: Record<string, { totalValue: number; totalQty: number }> = {};

  if (ticksSorted.length > 0) {
    const windowStart = ticksSorted[0].processedAt
      ? new Date(ticksSorted[0].processedAt.getTime() - 24 * 60 * 60 * 1000)
      : new Date(0);
    const windowEnd   = ticksSorted[ticksSorted.length - 1].processedAt ?? new Date();

    const transactions = await prisma.marketTransaction.findMany({
      where: {
        offer: { productId },
        transactedAt: { gte: windowStart, lte: windowEnd },
      },
      select: {
        transactedAt: true,
        quantity    : true,
        pricePerUnit: true,
      },
      orderBy: { transactedAt: "asc" },
    });

    // Assign each transaction to the nearest tick
    for (const txn of transactions) {
      const txnTime = txn.transactedAt.getTime();
      let assignedTickId: string | null = null;
      for (let i = 0; i < ticksSorted.length; i++) {
        const tickTime = ticksSorted[i].processedAt?.getTime() ?? 0;
        const prevTime = i > 0 ? (ticksSorted[i - 1].processedAt?.getTime() ?? 0) : 0;
        if (txnTime >= prevTime && txnTime <= tickTime) {
          assignedTickId = ticksSorted[i].id;
          break;
        }
      }
      if (!assignedTickId) assignedTickId = ticksSorted[ticksSorted.length - 1].id;

      wholesaleHistory[assignedTickId] ??= { totalValue: 0, totalQty: 0 };
      const qty = Number(txn.quantity);
      wholesaleHistory[assignedTickId].totalValue += qty * Number(txn.pricePerUnit);
      wholesaleHistory[assignedTickId].totalQty   += qty;
    }
  }

  // Build lookup maps
  const retailMap = new Map(retailByTick.map((r) => [r.tickId, r]));
  const prodMap   = new Map(prodByTick.map((p)  => [p.tickId, p]));

  // Compose history in chronological order (oldest → newest)
  const history = ticksSorted.map((t) => {
    const retail    = retailMap.get(t.id);
    const prod      = prodMap.get(t.id);
    const wholesale = wholesaleHistory[t.id];

    return {
      tickNumber        : t.tickNumber,
      processedAt       : t.processedAt,
      avgRetailPrice    : retail ? Number(retail._avg.price)              : null,
      totalRetailSold   : retail ? Number(retail._sum.quantitySold)       : 0,
      saturationIndex   : retail ? Number(retail._avg.saturationIndex)    : null,
      totalProduction   : prod   ? Number(prod.quantity)                  : 0,
      avgQuality        : prod   ? Number(prod.avgQuality)                : null,
      avgWholesalePrice : wholesale && wholesale.totalQty > 0
        ? wholesale.totalValue / wholesale.totalQty
        : null,
    };
  });

  return NextResponse.json({
    product: {
      id       : product.id,
      name     : product.name,
      unit     : product.unit,
      basePrice: Number(product.basePrice),
    },
    history,
  });
}
