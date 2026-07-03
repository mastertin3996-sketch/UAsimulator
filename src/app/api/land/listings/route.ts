import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const createListingSchema = z.object({
  landPlotId:  z.string().min(1),
  askingPrice: z.number().finite().positive(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const listings = await prisma.landPlotListing.findMany({
    where:   { isActive: true },
    include: {
      landPlot: { select: { totalAreaM2: true, soilQuality: true, usedAreaM2: true, city: { select: { nameUa: true } } } },
      seller:   { select: { username: true } },
    },
    orderBy: { askingPriceUah: "asc" },
  });

  return NextResponse.json({
    listings: listings.map(l => ({
      id:            l.id,
      landPlotId:    l.landPlotId,
      sellerName:    l.seller.username,
      sellerId:      l.sellerId,
      city:          l.landPlot.city.nameUa,
      totalAreaM2:   l.landPlot.totalAreaM2,
      usedAreaM2:    l.landPlot.usedAreaM2,
      soilQuality:   l.landPlot.soilQuality,
      askingPrice:   Number(l.askingPriceUah),
      isMyListing:   l.sellerId === session.user!.id,
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rawBody = await req.json().catch(() => null);
  const parsed  = createListingSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "landPlotId і askingPrice (>0) обов'язкові" }, { status: 400 });
  }
  const body = parsed.data;

  const plot = await prisma.landPlot.findFirst({
    where:   { id: body.landPlotId, playerId: session.user.id, status: "OWNED" },
    include: { enterprises: true, listing: true },
  });
  if (!plot) return NextResponse.json({ error: "Ділянку не знайдено або вона не у власності" }, { status: 404 });
  if (plot.enterprises.length > 0) return NextResponse.json({ error: "Не можна продати ділянку з підприємствами" }, { status: 409 });
  if (plot.listing?.isActive) return NextResponse.json({ error: "Ділянка вже виставлена на продаж" }, { status: 409 });

  if (plot.listing) {
    await prisma.landPlotListing.update({ where: { id: plot.listing.id }, data: { askingPriceUah: body.askingPrice, isActive: true } });
  } else {
    await prisma.landPlotListing.create({
      data: { landPlotId: body.landPlotId, sellerId: session.user.id, askingPriceUah: body.askingPrice },
    });
  }

  return NextResponse.json({ ok: true });
}
