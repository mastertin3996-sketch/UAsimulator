import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/production-history?take=20
// Returns retail sales from MY enterprises, grouped by tick + product
// Also returns global ProductionLog for products my lines produce
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const take      = Math.min(50, Number(req.nextUrl.searchParams.get("take") ?? "20"));
  const productId = req.nextUrl.searchParams.get("productId") ?? "";
  const entId     = req.nextUrl.searchParams.get("entId")     ?? "";

  const company = await prisma.company.findFirst({
    where : { ownerId: session.user.id },
    select: { id: true },
  });
  if (!company) return NextResponse.json({ error: "No company" }, { status: 404 });

  // My enterprises
  const myEnterprises = await prisma.enterprise.findMany({
    where  : { companyId: company.id, isActive: true },
    select : { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const myEntIds = myEnterprises.map((e) => e.id);

  // Last N completed ticks
  const ticks = await prisma.gameTick.findMany({
    where  : { status: "DONE" },
    orderBy: { tickNumber: "desc" },
    take,
    select : { id: true, tickNumber: true, processedAt: true },
  });
  if (ticks.length === 0) {
    return NextResponse.json({ ticks: [], summary: null, myEnterprises, myProducts: [] });
  }

  const tickIds      = ticks.map((t) => t.id);
  const ticksSorted  = [...ticks].sort((a, b) => a.tickNumber - b.tickNumber);

  // Retail sales for my enterprises per tick
  const retailWhere = {
    enterpriseId: { in: entId ? [entId] : myEntIds },
    tickId       : { in: tickIds },
    ...(productId ? { productId } : {}),
  };

  const retailRows = await prisma.retailSalesLog.groupBy({
    by   : ["tickId", "productId"],
    where: retailWhere,
    _sum : { quantitySold: true, revenue: true },
    _avg : { price: true, saturationIndex: true },
  });

  // Product names for those product IDs
  const prodIds   = [...new Set(retailRows.map((r) => r.productId))];
  const products  = await prisma.product.findMany({
    where  : { id: { in: prodIds } },
    select : { id: true, name: true, unit: true },
  });
  const prodMap   = new Map(products.map((p) => [p.id, p]));

  // Global ProductionLog for my products (only the ones I retail-sell)
  const globalProd = await prisma.productionLog.findMany({
    where  : { productId: { in: prodIds }, tickId: { in: tickIds } },
    select : { tickId: true, productId: true, quantity: true, avgQuality: true },
  });
  const globalProdMap = new Map(
    globalProd.map((g) => [`${g.tickId}:${g.productId}`, g])
  );

  // Build tick rows
  const tickRows = ticksSorted.map((t) => {
    const tickRetail = retailRows.filter((r) => r.tickId === t.id);

    const totalRevenue = tickRetail.reduce((s, r) => s + Number(r._sum.revenue ?? 0), 0);
    const totalQtySold = tickRetail.reduce((s, r) => s + Number(r._sum.quantitySold ?? 0), 0);

    const productBreakdown = tickRetail.map((r) => {
      const prod = prodMap.get(r.productId);
      const gp   = globalProdMap.get(`${t.id}:${r.productId}`);
      return {
        productId      : r.productId,
        productName    : prod?.name     ?? r.productId,
        unit           : prod?.unit     ?? "",
        qtySold        : Number(r._sum.quantitySold ?? 0),
        revenue        : Number(r._sum.revenue      ?? 0),
        avgPrice        : Number(r._avg.price           ?? 0),
        saturationIndex : Number(r._avg.saturationIndex ?? 0),
        globalProduced : gp ? Number(gp.quantity)   : null,
      };
    }).sort((a, b) => b.revenue - a.revenue);

    return {
      tickNumber     : t.tickNumber,
      processedAt    : t.processedAt,
      totalRevenue,
      totalQtySold,
      products       : productBreakdown,
    };
  });

  // Summary across all ticks
  const totalRev     = tickRows.reduce((s, t) => s + t.totalRevenue, 0);
  const totalQty     = tickRows.reduce((s, t) => s + t.totalQtySold, 0);
  const bestTick     = tickRows.reduce((b, t) => t.totalRevenue > b.totalRevenue ? t : b, tickRows[0]);
  const prodSummary  = new Map<string, { name: string; unit: string; totalQty: number; totalRev: number }>();
  for (const tr of tickRows) {
    for (const p of tr.products) {
      if (!prodSummary.has(p.productId)) {
        prodSummary.set(p.productId, { name: p.productName, unit: p.unit, totalQty: 0, totalRev: 0 });
      }
      const e = prodSummary.get(p.productId)!;
      e.totalQty += p.qtySold;
      e.totalRev += p.revenue;
    }
  }

  return NextResponse.json({
    ticks         : tickRows,
    myEnterprises,
    myProducts    : products,
    summary       : {
      totalRevenue : totalRev,
      totalQtySold : totalQty,
      tickCount    : ticks.length,
      bestTickNumber: bestTick?.tickNumber ?? null,
      bestTickRevenue: bestTick?.totalRevenue ?? 0,
      byProduct    : Array.from(prodSummary.entries()).map(([id, v]) => ({
        productId: id, ...v,
      })).sort((a, b) => b.totalRev - a.totalRev),
    },
  });
}
