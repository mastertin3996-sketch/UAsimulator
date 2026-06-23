import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as {
    isActive?: boolean;
    minStockTicks?: number;
    maxPricePerUnit?: number;
  };

  const rule = await prisma.replenishRule.findUnique({ where: { id } });
  if (!rule || rule.playerId !== playerId) {
    return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  }

  const updated = await prisma.replenishRule.update({
    where: { id },
    data: {
      ...(body.isActive       !== undefined ? { isActive:       body.isActive }       : {}),
      ...(body.minStockTicks  !== undefined ? { minStockTicks:  body.minStockTicks }  : {}),
      ...(body.maxPricePerUnit !== undefined ? { maxPricePerUnit: body.maxPricePerUnit } : {}),
    },
  });

  return NextResponse.json({ ok: true, isActive: updated.isActive });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;
  const { id } = await params;

  const rule = await prisma.replenishRule.findUnique({ where: { id } });
  if (!rule || rule.playerId !== playerId) {
    return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  }

  await prisma.replenishRule.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
