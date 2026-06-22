import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

async function ownedRule(ruleId: string, userId: string) {
  return prisma.autoReplenishRule.findFirst({
    where: { id: ruleId, enterprise: { company: { ownerId: userId } } },
    select: { id: true, enterpriseId: true },
  });
}

// PATCH /api/auto-replenish/[id]
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const rule = await ownedRule(id, session.user.id);
  if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json() as {
    isActive?       : boolean;
    minStockTicks?  : number;
    maxPricePerUnit?: number;
  };

  const updated = await prisma.autoReplenishRule.update({
    where : { id },
    data  : {
      ...(body.isActive        !== undefined && { isActive       : body.isActive }),
      ...(body.minStockTicks   !== undefined && { minStockTicks  : body.minStockTicks }),
      ...(body.maxPricePerUnit !== undefined && { maxPricePerUnit: body.maxPricePerUnit }),
    },
    include: { product: { select: { id: true, name: true, unit: true } } },
  });

  return NextResponse.json({ rule: updated });
}

// DELETE /api/auto-replenish/[id]
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const rule = await ownedRule(id, session.user.id);
  if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.autoReplenishRule.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
