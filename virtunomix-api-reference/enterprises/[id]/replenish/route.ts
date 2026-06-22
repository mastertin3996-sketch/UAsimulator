import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

// Verify ownership helper
async function ownedEnterprise(enterpriseId: string, userId: string) {
  return prisma.enterprise.findFirst({
    where: { id: enterpriseId, company: { ownerId: userId } },
    select: { id: true, companyId: true },
  });
}

// GET /api/enterprises/[id]/replenish
// Returns all AutoReplenishRules for this enterprise
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const ent = await ownedEnterprise(id, session.user.id);
  if (!ent) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rules = await prisma.autoReplenishRule.findMany({
    where  : { enterpriseId: id },
    include: { product: { select: { id: true, name: true, unit: true } } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ rules });
}

// PUT /api/enterprises/[id]/replenish
// Upsert a rule for a specific product
export async function PUT(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const ent = await ownedEnterprise(id, session.user.id);
  if (!ent) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json() as {
    productId       : string;
    isActive        : boolean;
    minStockTicks   : number;
    maxPricePerUnit : number;
  };

  if (!body.productId) return NextResponse.json({ error: "productId required" }, { status: 400 });
  if (body.minStockTicks < 1 || body.minStockTicks > 100)
    return NextResponse.json({ error: "minStockTicks must be 1–100" }, { status: 400 });
  if (body.maxPricePerUnit <= 0)
    return NextResponse.json({ error: "maxPricePerUnit must be > 0" }, { status: 400 });

  const rule = await prisma.autoReplenishRule.upsert({
    where : { enterpriseId_productId: { enterpriseId: id, productId: body.productId } },
    create: {
      enterpriseId   : id,
      productId      : body.productId,
      isActive       : body.isActive,
      minStockTicks  : body.minStockTicks,
      maxPricePerUnit: body.maxPricePerUnit,
    },
    update: {
      isActive       : body.isActive,
      minStockTicks  : body.minStockTicks,
      maxPricePerUnit: body.maxPricePerUnit,
    },
    include: { product: { select: { id: true, name: true, unit: true } } },
  });

  return NextResponse.json({ rule });
}
