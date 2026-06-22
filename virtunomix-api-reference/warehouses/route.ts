import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const company = await prisma.company.findFirst({
    where: { ownerId: session.user.id },
    select: { id: true },
  });
  if (!company) return NextResponse.json({ error: "No company" }, { status: 404 });

  // Inventory at enterprise level
  const enterpriseInventory = await prisma.inventory.findMany({
    where: {
      ownerType: "enterprise",
      enterprise: { companyId: company.id },
      quantity: { gt: 0 },
    },
    include: {
      enterprise: {
        select: {
          id: true, name: true,
          enterpriseType: { select: { category: true, icon: true } },
          city: { select: { name: true } },
        },
      },
      product: { select: { id: true, name: true, unit: true, basePrice: true } },
    },
    orderBy: [{ enterpriseId: "asc" }, { quantity: "desc" }],
  });

  // Inventory at standalone warehouse level
  const warehouseInventory = await prisma.inventory.findMany({
    where: {
      ownerType: "warehouse",
      warehouse: { companyId: company.id },
      quantity: { gt: 0 },
    },
    include: {
      warehouse: {
        select: {
          id: true, name: true,
          city: { select: { name: true } },
          capacity: true, usedCapacity: true,
        },
      },
      product: { select: { id: true, name: true, unit: true, basePrice: true } },
    },
    orderBy: [{ warehouseId: "asc" }, { quantity: "desc" }],
  });

  // Aggregate totals per product across all storage
  const productTotals = new Map<string, {
    productId: string; productName: string; unit: string; basePrice: number;
    totalQty: number; totalValue: number;
  }>();

  for (const inv of enterpriseInventory) {
    const key = inv.productId;
    if (!productTotals.has(key)) {
      productTotals.set(key, {
        productId: inv.productId,
        productName: inv.product.name,
        unit: inv.product.unit,
        basePrice: Number(inv.product.basePrice),
        totalQty: 0, totalValue: 0,
      });
    }
    const e = productTotals.get(key)!;
    e.totalQty   += Number(inv.quantity);
    e.totalValue += Number(inv.quantity) * Number(inv.avgCost || inv.product.basePrice);
  }
  for (const inv of warehouseInventory) {
    const key = inv.productId;
    if (!productTotals.has(key)) {
      productTotals.set(key, {
        productId: inv.productId,
        productName: inv.product.name,
        unit: inv.product.unit,
        basePrice: Number(inv.product.basePrice),
        totalQty: 0, totalValue: 0,
      });
    }
    const e = productTotals.get(key)!;
    e.totalQty   += Number(inv.quantity);
    e.totalValue += Number(inv.quantity) * Number(inv.avgCost || inv.product.basePrice);
  }

  // Group enterprise inventory by enterprise
  const byEnterprise = new Map<string, {
    id: string; name: string; category: string; icon: string | null; cityName: string;
    items: { productId: string; productName: string; unit: string; basePrice: number; quantity: number; reservedQty: number; quality: number; avgCost: number; autoSellQty: number; autoSellPrice: number | null }[];
  }>();

  for (const inv of enterpriseInventory) {
    const eid = inv.enterprise!.id;
    if (!byEnterprise.has(eid)) {
      byEnterprise.set(eid, {
        id: eid,
        name: inv.enterprise!.name,
        category: inv.enterprise!.enterpriseType.category,
        icon: inv.enterprise!.enterpriseType.icon,
        cityName: inv.enterprise!.city.name,
        items: [],
      });
    }
    byEnterprise.get(eid)!.items.push({
      productId:     inv.productId,
      productName:   inv.product.name,
      unit:          inv.product.unit,
      basePrice:     Number(inv.product.basePrice),
      quantity:      Number(inv.quantity),
      reservedQty:   Number(inv.reservedQty),
      quality:       Number(inv.quality),
      avgCost:       Number(inv.avgCost),
      autoSellQty:   Number((inv as any).autoSellQty ?? 0),
      autoSellPrice: (inv as any).autoSellPrice != null ? Number((inv as any).autoSellPrice) : null,
    });
  }

  return NextResponse.json({
    enterprises: Array.from(byEnterprise.values()),
    warehouses: warehouseInventory.reduce<Record<string, {
      id: string; name: string; cityName: string; capacity: number; usedCapacity: number;
      items: { productId: string; productName: string; unit: string; quantity: number; quality: number; avgCost: number }[];
    }>>((acc, inv) => {
      const wid = inv.warehouse!.id;
      if (!acc[wid]) {
        acc[wid] = {
          id: wid,
          name: inv.warehouse!.name,
          cityName: inv.warehouse!.city.name,
          capacity: inv.warehouse!.capacity,
          usedCapacity: inv.warehouse!.usedCapacity,
          items: [],
        };
      }
      acc[wid].items.push({
        productId:   inv.productId,
        productName: inv.product.name,
        unit:        inv.product.unit,
        quantity:    Number(inv.quantity),
        quality:     Number(inv.quality),
        avgCost:     Number(inv.avgCost),
      });
      return acc;
    }, {}),
    summary: Array.from(productTotals.values()).sort((a, b) => b.totalValue - a.totalValue),
  });
}
