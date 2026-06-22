import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const statusFilter = searchParams.get("status") ?? "ACTIVE";

  const company = await prisma.company.findFirst({
    where: { ownerId: session.user.id },
    select: { id: true },
  });
  if (!company) return NextResponse.json({ error: "No company" }, { status: 404 });

  const where: Record<string, unknown> = { sellerCompanyId: company.id };
  if (statusFilter !== "ALL") where.status = statusFilter;

  const offers = await prisma.marketOffer.findMany({
    where,
    include: {
      product: { select: { name: true, unit: true, basePrice: true, icon: true } },
      city   : { select: { name: true } },
      transactions: { select: { quantity: true, totalPrice: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  let totalRevenue = 0, totalQtySold = 0;

  const mapped = offers.map((o) => {
    const qtySold = o.transactions.reduce((s, t) => s + Number(t.quantity), 0);
    const revenue = o.transactions.reduce((s, t) => s + Number(t.totalPrice), 0);
    totalRevenue += revenue;
    totalQtySold += qtySold;
    return {
      id          : o.id,
      productId   : o.productId,
      productName : o.product.name,
      productUnit : o.product.unit,
      productIcon : o.product.icon ?? null,
      basePrice   : Number(o.product.basePrice),
      cityName    : o.city.name,
      price       : Number(o.price),
      quantity    : Number(o.quantity),
      qtySold,
      qtyRemaining: Math.max(0, Number(o.quantity) - qtySold),
      minOrder    : Number(o.minOrder),
      quality     : Number(o.quality),
      status      : o.status,
      expiresAt   : o.expiresAt,
      createdAt   : o.createdAt,
      priceVsBase : Number(o.product.basePrice) > 0
        ? Number(o.price) / Number(o.product.basePrice)
        : 1,
      revenue,
    };
  });

  return NextResponse.json({
    offers: mapped,
    stats : {
      activeCount  : mapped.filter((o) => o.status === "ACTIVE").length,
      totalRevenue,
      totalQtySold,
    },
  });
}
