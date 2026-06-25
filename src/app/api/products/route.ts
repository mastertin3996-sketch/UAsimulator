import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/products — list all tradeable products with open orders count
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const products = await prisma.product.findMany({
    where: { isEquipmentItem: false },
    select: {
      id: true, nameUa: true, unit: true, sku: true, category: true,
      _count: { select: { marketOrders: { where: { status: { in: ["OPEN", "PARTIALLY_FILLED"] } } } } },
    },
    orderBy: { nameUa: "asc" },
  });

  return NextResponse.json({
    products: products.map((p) => ({
      id:         p.id,
      nameUa:     p.nameUa,
      unit:       p.unit,
      sku:        p.sku,
      category:   p.category,
      orderCount: p._count.marketOrders,
    })),
  });
}
