import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/market/transactions
// ?role=buyer|seller|all  (default: all)
// ?productId=...
// ?take=50
// ?skip=0
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const company = await prisma.company.findFirst({
    where : { ownerId: session.user.id },
    select: { id: true },
  });
  if (!company) return NextResponse.json({ error: "No company" }, { status: 404 });

  const { searchParams } = req.nextUrl;
  const role      = searchParams.get("role") ?? "all";
  const productId = searchParams.get("productId") ?? null;
  const take      = Math.min(100, Number(searchParams.get("take") ?? "50"));
  const skip      = Number(searchParams.get("skip") ?? "0");

  // Build buyer/seller conditions
  const roleCond =
    role === "buyer"  ? { buyerCompanyId: company.id } :
    role === "seller" ? { sellerCompanyId: company.id } :
    { OR: [{ buyerCompanyId: company.id }, { sellerCompanyId: company.id }] };

  // Product filter via offer relation
  const productCond = productId
    ? { offer: { productId } }
    : {};

  const where = { ...roleCond, ...productCond };

  const [transactions, totalCount] = await Promise.all([
    prisma.marketTransaction.findMany({
      where,
      include: {
        offer        : { select: { product: { select: { name: true, unit: true, basePrice: true } }, city: { select: { name: true } } } },
        buyerCompany : { select: { id: true, name: true } },
        sellerCompany: { select: { id: true, name: true } },
      },
      orderBy: { transactedAt: "desc" },
      take,
      skip,
    }),
    prisma.marketTransaction.count({ where }),
  ]);

  // ── Per-product and daily aggregates ──────────────────────────────────────
  // Grab all records (no pagination) for analytics — limited to 2000 for perf
  const allRecords = await prisma.marketTransaction.findMany({
    where: { ...roleCond },
    include: {
      offer: { select: { product: { select: { id: true, name: true } } } },
    },
    orderBy: { transactedAt: "desc" },
    take: 2000,
  });

  let totalSpent  = 0;
  let totalEarned = 0;
  const productMap = new Map<string, { name: string; buyCount: number; sellCount: number; spent: number; earned: number }>();
  const dayMap     = new Map<string, { spent: number; earned: number; count: number }>();

  for (const t of allRecords) {
    const total     = Number(t.totalPrice);
    const isBuyer   = t.buyerCompanyId === company.id;
    const prodId    = t.offer.product.id;
    const prodName  = t.offer.product.name;
    const dayKey    = t.transactedAt.toISOString().slice(0, 10);

    if (isBuyer) totalSpent  += total;
    else         totalEarned += total;

    // Product aggregates
    if (!productMap.has(prodId)) productMap.set(prodId, { name: prodName, buyCount: 0, sellCount: 0, spent: 0, earned: 0 });
    const p = productMap.get(prodId)!;
    if (isBuyer) { p.buyCount++; p.spent += total; }
    else         { p.sellCount++; p.earned += total; }

    // Day aggregates
    if (!dayMap.has(dayKey)) dayMap.set(dayKey, { spent: 0, earned: 0, count: 0 });
    const d = dayMap.get(dayKey)!;
    if (isBuyer) d.spent += total; else d.earned += total;
    d.count++;
  }

  const topProducts = Array.from(productMap.entries())
    .map(([id, v]) => ({ id, ...v, total: v.spent + v.earned }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  // Last 30 days daily breakdown (sorted asc for chart)
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 29);
  const byDay = Array.from(dayMap.entries())
    .filter(([k]) => new Date(k) >= cutoff)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }));

  const mapped = transactions.map((t) => {
    const isBuyer = t.buyerCompanyId === company.id;
    return {
      id            : t.id,
      transactedAt  : t.transactedAt,
      productName   : t.offer.product.name,
      productUnit   : t.offer.product.unit,
      basePrice     : Number(t.offer.product.basePrice),
      cityName      : t.offer.city.name,
      quantity      : Number(t.quantity),
      pricePerUnit  : Number(t.pricePerUnit),
      totalPrice    : Number(t.totalPrice),
      role          : isBuyer ? "buyer" : "seller",
      counterparty  : isBuyer ? t.sellerCompany.name : t.buyerCompany.name,
    };
  });

  return NextResponse.json({
    transactions: mapped,
    total       : totalCount,
    stats: {
      totalSpent,
      totalEarned,
      netCashFlow : totalEarned - totalSpent,
      dealCount   : allRecords.length,
      topProducts,
      byDay,
    },
  });
}
