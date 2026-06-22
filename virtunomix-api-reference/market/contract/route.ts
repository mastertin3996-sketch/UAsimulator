import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/market/contract — список контрактів гравця (як продавець і як покупець)
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const company = await prisma.company.findFirst({ where: { ownerId: session.user.id } });
  if (!company) return NextResponse.json({ sellerContracts: [], buyerContracts: [] });

  const include = {
    sellerEnterprise: { select: { id: true, name: true, city: { select: { name: true } } } },
    buyerEnterprise:  { select: { id: true, name: true, city: { select: { name: true } } } },
    sellerCompany:    { select: { id: true, name: true } },
    buyerCompany:     { select: { id: true, name: true } },
    product:          { select: { id: true, name: true, unit: true, basePrice: true } },
    executions: {
      orderBy: { createdAt: "desc" as const },
      take: 3,
      select: { status: true, qtyDelivered: true, totalPaid: true, createdAt: true },
    },
  };

  const [sellerContracts, buyerContracts] = await Promise.all([
    prisma.supplyContract.findMany({
      where: { sellerCompanyId: company.id },
      include,
      orderBy: { createdAt: "desc" },
    }),
    prisma.supplyContract.findMany({
      where: { buyerCompanyId: company.id },
      include,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Lifetime totals for all contracts (not limited to 3 recent)
  const allIds = [...sellerContracts, ...buyerContracts].map((c) => c.id);
  const execAggs = allIds.length > 0
    ? await prisma.contractExecution.groupBy({
        by   : ["contractId"],
        where: { contractId: { in: allIds } },
        _sum : { totalPaid: true, qtyDelivered: true },
        _count: { id: true },
      })
    : [];
  const execMap = new Map(execAggs.map((e) => [e.contractId, e]));

  const fmt = (c: any) => {
    const agg = execMap.get(c.id);
    return {
      id:                c.id,
      status:            c.status,
      productName:       c.product.name,
      productUnit:       c.product.unit,
      basePrice:         Number(c.product.basePrice),
      qtyPerTick:        Number(c.qtyPerTick),
      pricePerUnit:      Number(c.pricePerUnit),
      quality:           Number(c.quality),
      durationTicks:     c.durationTicks,
      executedTicks:     c.executedTicks,
      expiresAt:         c.expiresAt,
      createdAt:         c.createdAt,
      lastExecutedAt:    c.lastExecutedAt,
      sellerCompanyName: c.sellerCompany.name,
      buyerCompanyName:  c.buyerCompany?.name ?? null,
      sellerEntName:     c.sellerEnterprise.name,
      sellerCity:        c.sellerEnterprise.city.name,
      buyerEntName:      c.buyerEnterprise?.name ?? null,
      buyerCity:         c.buyerEnterprise?.city?.name ?? null,
      recentExecs:       c.executions.map((e: any) => ({
        status:       e.status,
        qtyDelivered: Number(e.qtyDelivered),
        totalPaid:    Number(e.totalPaid),
        at:           e.createdAt,
      })),
      lifetimePaid: agg ? Number(agg._sum.totalPaid ?? 0) : 0,
      lifetimeQty : agg ? Number(agg._sum.qtyDelivered ?? 0) : 0,
      execCount   : agg?._count.id ?? 0,
    };
  };

  return NextResponse.json({
    sellerContracts: sellerContracts.map(fmt),
    buyerContracts:  buyerContracts.map(fmt),
  });
}
