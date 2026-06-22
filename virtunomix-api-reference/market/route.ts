import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cache, TTL_MARKET } from "@/lib/cache";
import { NPC_COMPANY_ID } from "@/lib/npc-config";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const cityId    = searchParams.get("cityId")    ?? "*";
  const productId = searchParams.get("productId") ?? "*";

  const cacheKey = `market:${cityId}:${productId}`;
  const hit = cache.get<object>(cacheKey);
  if (hit) {
    return NextResponse.json(hit, { headers: { "X-Cache": "HIT" } });
  }

  const offers = await prisma.marketOffer.findMany({
    where: {
      status: "ACTIVE",
      ...(cityId    !== "*" ? { cityId }    : {}),
      ...(productId !== "*" ? { productId } : {}),
    },
    include: {
      product:       { select: { name: true, unit: true, basePrice: true } },
      city:          { select: { name: true } },
      sellerCompany: { select: { id: true, name: true, rating: true } },
    },
    orderBy: { price: "asc" },
    take: 100,
  });

  const body = {
    offers: offers.map((o) => ({
      id          : o.id,
      productName : o.product.name,
      unit        : o.product.unit,
      basePrice   : Number(o.product.basePrice),
      cityName    : o.city.name,
      sellerName  : o.sellerCompany.name,
      sellerRating: Number(o.sellerCompany.rating),
      isNpc       : o.sellerCompany.id === NPC_COMPANY_ID,
      price       : Number(o.price),
      quantity    : Number(o.quantity),
      minOrder    : Number(o.minOrder),
      quality     : Number(o.quality),
      expiresAt   : o.expiresAt,
      priceVsBase : Number(o.price) / Number(o.product.basePrice),
    })),
  };

  cache.set(cacheKey, body, TTL_MARKET);
  return NextResponse.json(body, { headers: { "X-Cache": "MISS" } });
}

// POST /api/market — виставити товар на B2B ринок
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { enterpriseId, productId, quantity, price, minOrder, daysValid = 7 } =
    await req.json() as {
      enterpriseId: string;
      productId: string;
      quantity: number;
      price: number;
      minOrder?: number;
      daysValid?: number;
    };

  if (!enterpriseId || !productId || !quantity || !price) {
    return NextResponse.json({ error: "enterpriseId, productId, quantity, price — обов'язкові" }, { status: 400 });
  }
  if (price <= 0 || quantity <= 0) {
    return NextResponse.json({ error: "Ціна та кількість мають бути > 0" }, { status: 400 });
  }
  if (daysValid < 1 || daysValid > 30) {
    return NextResponse.json({ error: "daysValid: 1..30" }, { status: 400 });
  }

  // Перевірка що підприємство належить гравцю
  const enterprise = await prisma.enterprise.findUnique({
    where: { id: enterpriseId },
    include: { company: { select: { id: true, ownerId: true } }, city: true },
  });
  if (!enterprise) return NextResponse.json({ error: "Підприємство не знайдено" }, { status: 404 });
  if (enterprise.company.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });
  }

  // Перевірка наявності товару на складі
  const inv = await prisma.inventory.findFirst({
    where: { ownerType: "enterprise", enterpriseId, productId },
  });
  const available = Number(inv?.quantity ?? 0) - Number(inv?.reservedQty ?? 0);
  if (available < quantity) {
    return NextResponse.json({
      error: `Недостатньо товару. Доступно: ${available.toFixed(2)}, запитано: ${quantity}`,
    }, { status: 400 });
  }

  const expiresAt = new Date(Date.now() + daysValid * 86_400_000);
  const mo = minOrder ?? 1;

  const offer = await prisma.$transaction(async (tx) => {
    // Резервуємо товар на складі
    await tx.inventory.update({
      where: { id: inv!.id },
      data: { reservedQty: { increment: quantity } },
    });

    return tx.marketOffer.create({
      data: {
        sellerCompanyId: enterprise.company.id,
        productId,
        cityId: enterprise.cityId,
        price,
        quantity,
        minOrder: mo,
        quality: inv ? Number(inv.quality) : 5,
        expiresAt,
      },
    });
  });

  // New offer on market → invalidate all market cache entries
  cache.invalidatePrefix("market:");

  return NextResponse.json({ offer }, { status: 201 });
}
