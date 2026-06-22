import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ─── POST /api/warehouses/transfer ───────────────────────────────────────────
// Body: { sourceEnterpriseId, targetEnterpriseId, productId, quantity }
// Manually moves inventory between two enterprises owned by the user.

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { sourceEnterpriseId, targetEnterpriseId, productId, quantity } = body;

  if (!sourceEnterpriseId || !targetEnterpriseId || !productId || !quantity) {
    return NextResponse.json({ error: "Всі поля обов'язкові" }, { status: 400 });
  }
  if (sourceEnterpriseId === targetEnterpriseId) {
    return NextResponse.json({ error: "Джерело і ціль — одне підприємство" }, { status: 400 });
  }
  const qty = Number(quantity);
  if (qty <= 0) return NextResponse.json({ error: "Кількість має бути > 0" }, { status: 400 });

  // Verify both enterprises belong to user's company
  const company = await prisma.company.findFirst({
    where: { ownerId: session.user.id },
    select: { id: true },
  });
  if (!company) return NextResponse.json({ error: "Компанія не знайдена" }, { status: 404 });

  const [srcEnt, dstEnt] = await Promise.all([
    prisma.enterprise.findFirst({ where: { id: sourceEnterpriseId, companyId: company.id }, select: { id: true, name: true } }),
    prisma.enterprise.findFirst({ where: { id: targetEnterpriseId, companyId: company.id }, select: { id: true, name: true } }),
  ]);
  if (!srcEnt) return NextResponse.json({ error: "Підприємство-джерело не знайдено" }, { status: 404 });
  if (!dstEnt) return NextResponse.json({ error: "Підприємство-ціль не знайдено" }, { status: 404 });

  // Source inventory
  const srcInv = await prisma.inventory.findFirst({
    where: { ownerType: "enterprise", enterpriseId: sourceEnterpriseId, productId },
    select: { id: true, quantity: true, reservedQty: true, avgCost: true, quality: true },
  });
  if (!srcInv) return NextResponse.json({ error: "Товар відсутній на складі джерела" }, { status: 400 });

  const srcQty  = Number(srcInv.quantity);
  const srcRes  = Number(srcInv.reservedQty);
  const freeQty = srcQty - srcRes;

  if (freeQty < qty) {
    return NextResponse.json({
      error: `Недостатньо вільних запасів. Доступно: ${freeQty.toFixed(2)} (загалом ${srcQty.toFixed(2)}, зарезервовано ${srcRes.toFixed(2)})`,
    }, { status: 400 });
  }

  const srcAvgCost = Number(srcInv.avgCost);
  const srcQuality = Number(srcInv.quality);

  // Target inventory (may not exist yet)
  const dstInv = await prisma.inventory.findFirst({
    where: { ownerType: "enterprise", enterpriseId: targetEnterpriseId, productId },
    select: { id: true, quantity: true, avgCost: true, quality: true },
  });

  await prisma.$transaction(async (tx) => {
    // Decrement source
    await tx.inventory.update({
      where: { id: srcInv.id },
      data : { quantity: { decrement: qty } },
    });

    if (dstInv) {
      // Weighted avg cost and quality
      const dstQty     = Number(dstInv.quantity);
      const newTotal   = dstQty + qty;
      const newAvgCost = newTotal > 0
        ? (dstQty * Number(dstInv.avgCost) + qty * srcAvgCost) / newTotal
        : srcAvgCost;
      const newQuality = newTotal > 0
        ? (dstQty * Number(dstInv.quality) + qty * srcQuality) / newTotal
        : srcQuality;

      await tx.inventory.update({
        where: { id: dstInv.id },
        data : { quantity: { increment: qty }, avgCost: newAvgCost, quality: newQuality },
      });
    } else {
      await tx.inventory.create({
        data: {
          ownerType   : "enterprise",
          enterpriseId: targetEnterpriseId,
          productId,
          quantity    : qty,
          reservedQty : 0,
          avgCost     : srcAvgCost,
          quality     : srcQuality,
        },
      });
    }
  });

  return NextResponse.json({ ok: true, transferred: qty });
}
