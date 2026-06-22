import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;
  const { sourceEnterpriseId, targetEnterpriseId, productId, quantity } = await req.json();

  if (!sourceEnterpriseId || !targetEnterpriseId || !productId || !quantity) {
    return NextResponse.json({ error: "Невірні параметри" }, { status: 400 });
  }
  if (sourceEnterpriseId === targetEnterpriseId) {
    return NextResponse.json({ error: "Ціль не може бути джерелом" }, { status: 400 });
  }

  // Verify both enterprises belong to player
  const [src, dst] = await Promise.all([
    prisma.enterprise.findFirst({ where: { id: sourceEnterpriseId, playerId } }),
    prisma.enterprise.findFirst({ where: { id: targetEnterpriseId, playerId } }),
  ]);
  if (!src || !dst) return NextResponse.json({ error: "Підприємство не знайдено" }, { status: 404 });

  // Check source has enough
  const srcInv = await prisma.enterpriseInventory.findUnique({
    where: { enterpriseId_productId: { enterpriseId: sourceEnterpriseId, productId } },
  });
  if (!srcInv || srcInv.quantity < quantity) {
    return NextResponse.json({ error: `Недостатньо (є ${srcInv?.quantity ?? 0})` }, { status: 400 });
  }

  const quality = srcInv.avgQuality;

  await prisma.$transaction([
    // Deduct from source
    prisma.enterpriseInventory.update({
      where: { enterpriseId_productId: { enterpriseId: sourceEnterpriseId, productId } },
      data: { quantity: { decrement: quantity } },
    }),
    // Add to target
    prisma.enterpriseInventory.upsert({
      where: { enterpriseId_productId: { enterpriseId: targetEnterpriseId, productId } },
      update: { quantity: { increment: quantity }, avgQuality: quality },
      create: { enterpriseId: targetEnterpriseId, productId, quantity, avgQuality: quality },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
