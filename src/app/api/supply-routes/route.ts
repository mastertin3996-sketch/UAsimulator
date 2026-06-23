import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const playerId = session.user.id;

  const [routes, enterprises] = await Promise.all([
    prisma.supplyRoute.findMany({
      where:   { playerId },
      orderBy: { createdAt: "asc" },
      include: {
        sourceEnterprise: { select: { name: true } },
        targetEnterprise: { select: { name: true } },
        product:          { select: { nameUa: true, unit: true } },
      },
    }),
    prisma.enterprise.findMany({
      where:   { playerId, isOperational: true },
      select:  {
        id:   true,
        name: true,
        inventory: {
          where:  { quantity: { gt: 0 } },
          select: {
            productId: true,
            quantity:  true,
            product:   { select: { nameUa: true, unit: true } },
          },
        },
      },
    }),
  ]);

  // Build inventory map for quick sourceQty / targetQty lookup
  const invMap = new Map<string, Map<string, number>>();
  for (const ent of enterprises) {
    const m = new Map<string, number>();
    for (const inv of ent.inventory) m.set(inv.productId, Number(inv.quantity));
    invMap.set(ent.id, m);
  }

  return NextResponse.json({
    routes: routes.map((r) => ({
      id:                 r.id,
      sourceEnterpriseId: r.sourceEnterpriseId,
      sourceName:         r.sourceEnterprise.name,
      targetEnterpriseId: r.targetEnterpriseId,
      targetName:         r.targetEnterprise.name,
      productId:          r.productId,
      productName:        r.product.nameUa,
      unit:               r.product.unit,
      qtyPerTick:         r.qtyPerTick,
      isActive:           r.isActive,
      sourceQty:          invMap.get(r.sourceEnterpriseId)?.get(r.productId) ?? 0,
      targetQty:          invMap.get(r.targetEnterpriseId)?.get(r.productId) ?? 0,
    })),
    enterprises: enterprises.map((e) => ({
      id:    e.id,
      name:  e.name,
      items: e.inventory.map((i) => ({
        productId:   i.productId,
        productName: i.product.nameUa,
        unit:        i.product.unit,
        quantity:    Number(i.quantity),
      })),
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const playerId = session.user.id;

  const body = await req.json().catch(() => ({})) as {
    sourceEnterpriseId?: string;
    targetEnterpriseId?: string;
    productId?:          string;
    qtyPerTick?:         number;
  };

  if (!body.sourceEnterpriseId || !body.targetEnterpriseId || !body.productId || !body.qtyPerTick) {
    return NextResponse.json({ error: "Потрібні: sourceEnterpriseId, targetEnterpriseId, productId, qtyPerTick" }, { status: 400 });
  }
  if (body.qtyPerTick <= 0) {
    return NextResponse.json({ error: "qtyPerTick має бути > 0" }, { status: 400 });
  }
  if (body.sourceEnterpriseId === body.targetEnterpriseId) {
    return NextResponse.json({ error: "Джерело і ціль не можуть бути однаковими" }, { status: 400 });
  }

  // Verify ownership of both enterprises
  const [src, tgt] = await Promise.all([
    prisma.enterprise.findFirst({ where: { id: body.sourceEnterpriseId, playerId }, select: { id: true } }),
    prisma.enterprise.findFirst({ where: { id: body.targetEnterpriseId, playerId }, select: { id: true } }),
  ]);
  if (!src) return NextResponse.json({ error: "Підприємство-джерело не знайдено" }, { status: 404 });
  if (!tgt) return NextResponse.json({ error: "Підприємство-ціль не знайдено" }, { status: 404 });

  const product = await prisma.product.findUnique({ where: { id: body.productId }, select: { id: true } });
  if (!product) return NextResponse.json({ error: "Продукт не знайдено" }, { status: 404 });

  const route = await prisma.supplyRoute.create({
    data: {
      playerId,
      sourceEnterpriseId: body.sourceEnterpriseId,
      targetEnterpriseId: body.targetEnterpriseId,
      productId:          body.productId,
      qtyPerTick:         body.qtyPerTick,
    },
  });

  return NextResponse.json({ ok: true, routeId: route.id }, { status: 201 });
}
