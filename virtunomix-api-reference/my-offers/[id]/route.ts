import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cache } from "@/lib/cache";

type Params = { params: Promise<{ id: string }> };

async function getOwnOffer(id: string, userId: string) {
  const offer = await prisma.marketOffer.findUnique({
    where  : { id },
    include: { sellerCompany: { select: { id: true, ownerId: true } } },
  });
  if (!offer) return { offer: null, error: "Не знайдено", status: 404 };
  if (offer.sellerCompany.ownerId !== userId) return { offer: null, error: "Доступ заборонено", status: 403 };
  return { offer, error: null, status: 200 };
}

// PATCH — змінити ціну і/або мін. замовлення
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { price, minOrder } = await req.json() as { price?: number; minOrder?: number };

  if (price !== undefined && price <= 0) {
    return NextResponse.json({ error: "Ціна має бути > 0" }, { status: 400 });
  }

  const { offer, error, status } = await getOwnOffer(id, session.user.id);
  if (!offer) return NextResponse.json({ error }, { status });
  if (offer.status !== "ACTIVE") {
    return NextResponse.json({ error: "Можна редагувати тільки активні оферти" }, { status: 400 });
  }

  const updated = await prisma.marketOffer.update({
    where: { id },
    data : {
      ...(price    !== undefined ? { price }    : {}),
      ...(minOrder !== undefined ? { minOrder } : {}),
    },
    select: { id: true, price: true, minOrder: true },
  });

  cache.invalidatePrefix("market:");

  return NextResponse.json({
    ok      : true,
    id      : updated.id,
    price   : Number(updated.price),
    minOrder: Number(updated.minOrder),
  });
}

// DELETE — скасувати оферту + звільнити резервований товар
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const { offer, error, status } = await getOwnOffer(id, session.user.id);
  if (!offer) return NextResponse.json({ error }, { status });
  if (offer.status !== "ACTIVE") {
    return NextResponse.json({ error: "Можна скасувати тільки активні оферти" }, { status: 400 });
  }

  const transactions = await prisma.marketTransaction.findMany({
    where : { offerId: id },
    select: { quantity: true },
  });
  const qtySold      = transactions.reduce((s, t) => s + Number(t.quantity), 0);
  const qtyRemaining = Math.max(0, Number(offer.quantity) - qtySold);

  // Offer doesn't store enterpriseId — best-effort: find the inventory record
  // for this company's enterprise in this city that has reservedQty for this product.
  let qtyReleased = 0;

  await prisma.$transaction(async (tx) => {
    await tx.marketOffer.update({ where: { id }, data: { status: "CANCELLED" } });

    if (qtyRemaining > 0) {
      const enterpriseIds = (await tx.enterprise.findMany({
        where : { companyId: offer.sellerCompany.id, cityId: offer.cityId },
        select: { id: true },
      })).map((e) => e.id);

      if (enterpriseIds.length > 0) {
        const inv = await tx.inventory.findFirst({
          where: {
            ownerType   : "enterprise",
            enterpriseId: { in: enterpriseIds },
            productId   : offer.productId,
            reservedQty : { gt: 0 },
          },
          orderBy: { reservedQty: "desc" },
        });
        if (inv) {
          const toRelease = Math.min(Number(inv.reservedQty), qtyRemaining);
          await tx.inventory.update({
            where: { id: inv.id },
            data : { reservedQty: { decrement: toRelease } },
          });
          qtyReleased = toRelease;
        }
      }
    }
  });

  cache.invalidatePrefix("market:");

  return NextResponse.json({ ok: true, qtyReleased });
}
