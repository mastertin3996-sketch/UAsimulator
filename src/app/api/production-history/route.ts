import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;
  const { searchParams } = new URL(req.url);
  const enterpriseId = searchParams.get("enterpriseId") ?? undefined;
  const productId    = searchParams.get("productId")    ?? undefined;
  const take = Math.min(30, Number(searchParams.get("take") ?? 20));
  const skip = Number(searchParams.get("skip") ?? 0);

  // Find player enterprises
  const enterprises = await prisma.enterprise.findMany({
    where: { playerId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const myEntIds = enterprises.map((e) => e.id);

  // Build where
  const logWhere: Record<string, unknown> = { enterpriseId: { in: myEntIds } };
  if (enterpriseId) logWhere.enterpriseId = enterpriseId;
  if (productId) {
    // Find recipe outputs for this product
    const recipeIds = (await prisma.recipeOutput.findMany({
      where: { productId },
      select: { recipeId: true },
    })).map((r) => r.recipeId);
    logWhere.recipeId = { in: recipeIds };
  }

  // Get unique product options player has ever produced
  const allLogs = await prisma.productionLog.findMany({
    where: { enterpriseId: { in: myEntIds } },
    select: { recipeId: true },
    distinct: ["recipeId"],
    take: 100,
  });
  const allRecipeIds = allLogs.map((l) => l.recipeId);
  const recipeOutputs = await prisma.recipeOutput.findMany({
    where: { recipeId: { in: allRecipeIds } },
    select: { recipeId: true, product: { select: { id: true, nameUa: true, unit: true } } },
  });
  const myProducts = Array.from(
    new Map(recipeOutputs.map((r) => [r.product.id, r.product])).values()
  ).map((p) => ({ id: p.id, name: p.nameUa, unit: p.unit }));

  // Group production logs by tick
  const logs = await prisma.productionLog.findMany({
    where: logWhere,
    orderBy: { tickNumber: "desc" },
    skip,
    take: take * 10,
    select: {
      id: true, tickNumber: true, unitsProduced: true, avgQuality: true, recordedAt: true,
      recipeId: true,
    },
  });

  // Group by tick
  const tickMap = new Map<number, typeof logs>();
  for (const log of logs) {
    const t = Number(log.tickNumber);
    if (!tickMap.has(t)) tickMap.set(t, []);
    tickMap.get(t)!.push(log);
  }

  // Get recipe → product mapping
  const recipeIds = [...new Set(logs.map((l) => l.recipeId))];
  const rOutputs = await prisma.recipeOutput.findMany({
    where: { recipeId: { in: recipeIds } },
    select: { recipeId: true, product: { select: { id: true, nameUa: true, unit: true } } },
  });
  const recipeProductMap = new Map(rOutputs.map((r) => [r.recipeId, r.product]));

  // NPC base prices
  const prodIds = [...new Set(rOutputs.map((r) => r.product.id))];
  const npcPrices = await prisma.npcDemand.groupBy({
    by: ["productId"],
    where: { productId: { in: prodIds } },
    _avg: { referencePrice: true },
  });
  const basePriceMap = new Map(npcPrices.map((n) => [n.productId, Number(n._avg.referencePrice ?? 0)]));

  const sortedTicks = Array.from(tickMap.entries())
    .sort((a, b) => b[0] - a[0])
    .slice(0, take);

  const ticks = sortedTicks.map(([tickNumber, tickLogs]) => {
    // Group by product
    const prodMap = new Map<string, { productId: string; productName: string; unit: string; qty: number; qualitySum: number; count: number }>();
    for (const log of tickLogs) {
      const prod = recipeProductMap.get(log.recipeId);
      if (!prod) continue;
      const cur = prodMap.get(prod.id) ?? { productId: prod.id, productName: prod.nameUa, unit: prod.unit, qty: 0, qualitySum: 0, count: 0 };
      cur.qty        += log.unitsProduced;
      cur.qualitySum += log.avgQuality * log.unitsProduced;
      cur.count++;
      prodMap.set(prod.id, cur);
    }
    const products = Array.from(prodMap.values()).map((p) => {
      const basePrice = basePriceMap.get(p.productId) ?? 0;
      return {
        productId:       p.productId,
        productName:     p.productName,
        unit:            p.unit,
        qtySold:         p.qty,
        revenue:         Math.round(p.qty * basePrice),
        avgPrice:        basePrice,
        saturationIndex: 1.0,
        globalProduced:  null,
      };
    });

    const totalQtySold  = products.reduce((s, p) => s + p.qtySold, 0);
    const totalRevenue  = products.reduce((s, p) => s + p.revenue, 0);

    return {
      tickNumber,
      processedAt: tickLogs[0].recordedAt.toISOString(),
      totalRevenue,
      totalQtySold,
      products,
    };
  });

  // Summary
  const allProdMap = new Map<string, { productId: string; name: string; unit: string; totalQty: number; totalRev: number }>();
  let bestTickNumber = null as number | null, bestTickRevenue = 0;
  for (const tick of ticks) {
    if (tick.totalRevenue > bestTickRevenue) { bestTickRevenue = tick.totalRevenue; bestTickNumber = tick.tickNumber; }
    for (const p of tick.products) {
      const cur = allProdMap.get(p.productId) ?? { productId: p.productId, name: p.productName, unit: p.unit, totalQty: 0, totalRev: 0 };
      cur.totalQty += p.qtySold;
      cur.totalRev += p.revenue;
      allProdMap.set(p.productId, cur);
    }
  }

  const summary = {
    totalRevenue:    ticks.reduce((s, t) => s + t.totalRevenue, 0),
    totalQtySold:    ticks.reduce((s, t) => s + t.totalQtySold, 0),
    tickCount:       ticks.length,
    bestTickNumber,
    bestTickRevenue,
    byProduct:       Array.from(allProdMap.values()),
  };

  return NextResponse.json({ ticks, summary, myEnterprises: enterprises, myProducts });
}
