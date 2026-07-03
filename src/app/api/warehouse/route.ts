import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const createOfferSchema = z.object({
  enterpriseId: z.string().min(1),
  pricePerTick: z.number().finite().positive(),
  capacityKg:   z.number().finite().positive(),
  description:  z.string().optional(),
});

// GET — list all active warehouse rental offers
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const offers = await prisma.warehouseRentalOffer.findMany({
    where:   { isActive: true },
    include: {
      owner:      { select: { username: true } },
      enterprise: { select: { name: true, landPlot: { select: { city: { select: { nameUa: true } } } } } },
      subscriptions: { where: { isActive: true }, select: { tenantId: true } },
    },
    orderBy: { pricePerTick: "asc" },
  });

  const playerId = session.user.id;

  return NextResponse.json({
    offers: offers.map(o => ({
      id:            o.id,
      enterpriseName: o.enterprise.name,
      city:          o.enterprise.landPlot.city.nameUa,
      ownerName:     o.owner.username,
      ownerId:       o.ownerId,
      pricePerTick:  Number(o.pricePerTick),
      capacityKg:    o.capacityKg,
      description:   o.description,
      tenantCount:   o.subscriptions.length,
      isSubscribed:  o.subscriptions.some(s => s.tenantId === playerId),
      isOwnOffer:    o.ownerId === playerId,
    })),
  });
}

// POST — create a new rental offer (only for WAREHOUSE type enterprises)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rawBody = await req.json().catch(() => null);
  const parsed  = createOfferSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "enterpriseId, pricePerTick і capacityKg обов'язкові (числа > 0)" }, { status: 400 });
  }
  const body = parsed.data;

  const enterprise = await prisma.enterprise.findFirst({
    where: { id: body.enterpriseId, playerId: session.user.id, type: "WAREHOUSE" },
  });
  if (!enterprise) return NextResponse.json({ error: "WAREHOUSE підприємство не знайдено" }, { status: 404 });

  // Only one active offer per enterprise
  const existing = await prisma.warehouseRentalOffer.findFirst({
    where: { enterpriseId: body.enterpriseId, isActive: true },
  });
  if (existing) return NextResponse.json({ error: "Для цього складу вже є активна пропозиція" }, { status: 409 });

  const offer = await prisma.warehouseRentalOffer.create({
    data: {
      enterpriseId: body.enterpriseId,
      ownerId:      session.user.id,
      pricePerTick: body.pricePerTick,
      capacityKg:   body.capacityKg,
      description:  body.description ?? null,
    },
  });

  return NextResponse.json({ ok: true, offerId: offer.id });
}
