import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const company = await prisma.company.findFirst({ where: { ownerId: session.user.id } });
  if (!company) return NextResponse.json({ routes: [] });

  const routes = await prisma.internalSupplyRoute.findMany({
    where: { companyId: company.id },
    include: {
      sourceEnterprise: { select: { id: true, name: true } },
      targetEnterprise: { select: { id: true, name: true } },
      product:          { select: { id: true, name: true, unit: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // Inventory snapshot for stock level indicators
  const entIds     = [...new Set(routes.flatMap((r) => [r.sourceEnterpriseId, r.targetEnterpriseId]))];
  const productIds = [...new Set(routes.map((r) => r.productId))];

  const inventories = entIds.length > 0 && productIds.length > 0
    ? await prisma.inventory.findMany({
        where: {
          ownerType   : "ENTERPRISE",
          enterpriseId: { in: entIds },
          productId   : { in: productIds },
        },
        select: { enterpriseId: true, productId: true, quantity: true, reservedQty: true },
      })
    : [];

  const invMap = new Map<string, number>();
  for (const inv of inventories) {
    invMap.set(`${inv.enterpriseId}:${inv.productId}`, Number(inv.quantity) - Number(inv.reservedQty));
  }

  return NextResponse.json({
    routes: routes.map((r) => ({
      id                : r.id,
      sourceEnterpriseId: r.sourceEnterpriseId,
      sourceName        : r.sourceEnterprise.name,
      targetEnterpriseId: r.targetEnterpriseId,
      targetName        : r.targetEnterprise.name,
      productId         : r.productId,
      productName       : r.product.name,
      unit              : r.product.unit,
      qtyPerTick        : Number(r.qtyPerTick),
      isActive          : r.isActive,
      sourceQty         : invMap.get(`${r.sourceEnterpriseId}:${r.productId}`) ?? 0,
      targetQty         : invMap.get(`${r.targetEnterpriseId}:${r.productId}`) ?? 0,
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sourceEnterpriseId, targetEnterpriseId, productId, qtyPerTick } =
    await req.json() as {
      sourceEnterpriseId: string;
      targetEnterpriseId: string;
      productId         : string;
      qtyPerTick        : number;
    };

  if (!sourceEnterpriseId || !targetEnterpriseId || !productId || !qtyPerTick) {
    return NextResponse.json({ error: "Всі поля обов'язкові" }, { status: 400 });
  }
  if (sourceEnterpriseId === targetEnterpriseId) {
    return NextResponse.json({ error: "Джерело та ціль не можуть збігатися" }, { status: 400 });
  }
  if (qtyPerTick <= 0) {
    return NextResponse.json({ error: "Кількість має бути > 0" }, { status: 400 });
  }

  const company = await prisma.company.findFirst({ where: { ownerId: session.user.id } });
  if (!company) return NextResponse.json({ error: "Компанія не знайдена" }, { status: 404 });

  // Verify both enterprises belong to this company
  const [src, tgt] = await Promise.all([
    prisma.enterprise.findFirst({ where: { id: sourceEnterpriseId, companyId: company.id } }),
    prisma.enterprise.findFirst({ where: { id: targetEnterpriseId, companyId: company.id } }),
  ]);
  if (!src) return NextResponse.json({ error: "Джерело не знайдено" }, { status: 404 });
  if (!tgt) return NextResponse.json({ error: "Ціль не знайдено" }, { status: 404 });

  // Prevent duplicate routes
  const exists = await prisma.internalSupplyRoute.findFirst({
    where: { companyId: company.id, sourceEnterpriseId, targetEnterpriseId, productId },
  });
  if (exists) {
    // Update qty instead
    const updated = await prisma.internalSupplyRoute.update({
      where: { id: exists.id },
      data: { qtyPerTick, isActive: true },
    });
    return NextResponse.json({ route: updated });
  }

  const route = await prisma.internalSupplyRoute.create({
    data: { companyId: company.id, sourceEnterpriseId, targetEnterpriseId, productId, qtyPerTick },
  });

  return NextResponse.json({ route }, { status: 201 });
}
