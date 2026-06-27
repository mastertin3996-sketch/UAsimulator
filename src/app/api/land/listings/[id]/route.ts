import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

// POST — buy or cancel
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({})) as { action?: "buy" | "cancel" };

  const listing = await prisma.landPlotListing.findUnique({
    where:   { id },
    include: { landPlot: { select: { totalAreaM2: true, city: { select: { nameUa: true } } } } },
  });
  if (!listing || !listing.isActive) return NextResponse.json({ error: "Оголошення не знайдено" }, { status: 404 });

  if (body.action === "cancel") {
    if (listing.sellerId !== session.user.id) return NextResponse.json({ error: "Не ваше оголошення" }, { status: 403 });
    await prisma.landPlotListing.update({ where: { id }, data: { isActive: false } });
    return NextResponse.json({ ok: true, message: "Оголошення знято" });
  }

  // buy
  if (listing.sellerId === session.user.id) return NextResponse.json({ error: "Не можна купити власну ділянку" }, { status: 400 });

  const price = Number(listing.askingPriceUah);
  const buyer = await prisma.player.findUnique({ where: { id: session.user.id }, select: { cashBalance: true } });
  if (!buyer || Number(buyer.cashBalance) < price) {
    return NextResponse.json({ error: `Недостатньо коштів. Ціна: ₴${price.toLocaleString("uk-UA")}` }, { status: 422 });
  }

  const tick = await prisma.gameTick.findFirst({ orderBy: { tickNumber: "desc" }, select: { tickNumber: true } });
  const now  = tick?.tickNumber ?? 0n;

  await prisma.$transaction([
    // Transfer ownership
    prisma.landPlot.update({
      where: { id: listing.landPlotId },
      data:  { playerId: session.user.id, purchasedAt: new Date() },
    }),
    // Deduct buyer
    prisma.player.update({ where: { id: session.user.id },  data: { cashBalance: { decrement: price } } }),
    // Credit seller
    prisma.player.update({ where: { id: listing.sellerId }, data: { cashBalance: { increment: price } } }),
    // Close listing
    prisma.landPlotListing.update({ where: { id }, data: { isActive: false } }),
    // Buyer log
    prisma.financialLog.create({
      data: { playerId: session.user.id, category: "EXPENSE_LEASE", amountUah: -price,
        description: `Купівля ділянки у ${listing.landPlot.city.nameUa} (${listing.landPlot.totalAreaM2} м²)`, tickNumber: now },
    }),
    // Seller log
    prisma.financialLog.create({
      data: { playerId: listing.sellerId, category: "REVENUE_MA", amountUah: price,
        description: `Продаж ділянки у ${listing.landPlot.city.nameUa}: ₴${price.toLocaleString("uk-UA")}`, tickNumber: now },
    }),
  ]);

  // Notifications
  await Promise.all([
    prisma.notification.create({ data: { playerId: session.user.id, type: "MACRO_EVENT",
      title: "Ділянку придбано", body: `Земельна ділянка у ${listing.landPlot.city.nameUa} перейшла у вашу власність за ₴${price.toLocaleString("uk-UA")}.` } }),
    prisma.notification.create({ data: { playerId: listing.sellerId, type: "MACRO_EVENT",
      title: "Ділянку продано", body: `Ваша земельна ділянка у ${listing.landPlot.city.nameUa} продана за ₴${price.toLocaleString("uk-UA")}.` } }),
  ]).catch(() => {});

  return NextResponse.json({ ok: true, message: `Ділянку куплено за ₴${price.toLocaleString("uk-UA")}` });
}
