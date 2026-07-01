import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { allowRate } from "@/lib/rateLimit";

const createDealSchema = z.object({
  targetEnterpriseId: z.string().min(1).optional(),
  priceUah:           z.number().finite().positive(),
  notes:              z.string().max(500).optional(),
});

const dealSelect = {
  id: true, status: true,
  transactionAmountUah: true, listedAtTick: true,
  executedAtTick: true, canceledAtTick: true, notes: true, createdAt: true,
  sellerId: true, buyerId: true,
  targetEnterpriseId: true,
  seller: { select: { companyName: true, id: true } },
  buyer:  { select: { companyName: true, id: true } },
} as const;

function serializeDeal(d: {
  id: string; status: string; transactionAmountUah: { toString(): string };
  listedAtTick: bigint; executedAtTick: bigint | null; canceledAtTick: bigint | null;
  notes: string | null; createdAt: Date; sellerId: string; buyerId: string | null;
  targetEnterpriseId: string | null;
  seller: { companyName: string | null; id: string };
  buyer: { companyName: string | null; id: string } | null;
}, enterprise?: { name: string; type: string; city: { nameUa: string } } | null) {
  return {
    id:                   d.id,
    status:               d.status,
    transactionAmountUah: Number(d.transactionAmountUah),
    listedAtTick:         Number(d.listedAtTick),
    executedAtTick:       d.executedAtTick ? Number(d.executedAtTick) : null,
    canceledAtTick:       d.canceledAtTick ? Number(d.canceledAtTick) : null,
    notes:                d.notes,
    createdAt:            d.createdAt,
    sellerId:             d.sellerId,
    buyerId:              d.buyerId,
    targetEnterpriseId:   d.targetEnterpriseId,
    sellerName:           d.seller.companyName ?? "—",
    buyerName:            d.buyer?.companyName ?? null,
    enterprise:           enterprise
      ? { name: enterprise.name, type: enterprise.type, city: enterprise.city.nameUa }
      : null,
  };
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;

  const [marketplace, myListings, myPurchases, myEnterprises] = await Promise.all([
    prisma.maDeal.findMany({
      where: { status: "PENDING", sellerId: { not: playerId } },
      select: dealSelect,
      orderBy: { createdAt: "desc" },
    }),
    prisma.maDeal.findMany({
      where: { sellerId: playerId },
      select: dealSelect,
      orderBy: { createdAt: "desc" },
    }),
    prisma.maDeal.findMany({
      where: { buyerId: playerId },
      select: dealSelect,
      orderBy: { executedAtTick: "desc" },
    }),
    prisma.enterprise.findMany({
      where: { playerId, isOperational: true },
      select: {
        id: true, name: true, type: true,
        landPlot: { select: { city: { select: { nameUa: true } } } },
      },
    }),
  ]);

  // Enrich with enterprise info
  const allDeals = [...marketplace, ...myListings, ...myPurchases];
  const enterpriseIds = [...new Set(allDeals.map(d => d.targetEnterpriseId).filter(Boolean))] as string[];
  const enterprises = await prisma.enterprise.findMany({
    where: { id: { in: enterpriseIds } },
    select: {
      id: true, name: true, type: true,
      landPlot: { select: { city: { select: { nameUa: true } } } },
    },
  });
  const entMap = new Map(enterprises.map(e => [e.id, {
    name: e.name, type: e.type,
    city: { nameUa: e.landPlot.city.nameUa },
  }]));

  return NextResponse.json({
    marketplace: marketplace.map(d => serializeDeal(d, d.targetEnterpriseId ? entMap.get(d.targetEnterpriseId) : null)),
    myListings:  myListings.map(d => serializeDeal(d, d.targetEnterpriseId ? entMap.get(d.targetEnterpriseId) : null)),
    myPurchases: myPurchases.map(d => serializeDeal(d, d.targetEnterpriseId ? entMap.get(d.targetEnterpriseId) : null)),
    myEnterprises: myEnterprises.map(e => ({
      id: e.id, name: e.name, type: e.type,
      city: e.landPlot.city.nameUa,
    })),
  });
}

// POST — create listing: { targetEnterpriseId?: string, priceUah: number, notes?: string }
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;

  if (!allowRate(`ma-create:${playerId}`, 3000)) {
    return NextResponse.json({ error: "Забагато запитів — спробуйте за кілька секунд" }, { status: 429 });
  }

  const rawBody = await req.json().catch(() => null);
  const parsed  = createDealSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Потрібна priceUah (число > 0); targetEnterpriseId/notes — опційно" }, { status: 400 });
  }
  const body = parsed.data;

  try {
    // Validate enterprise ownership if specific enterprise
    if (body.targetEnterpriseId) {
      const ent = await prisma.enterprise.findFirst({
        where: { id: body.targetEnterpriseId, playerId },
      });
      if (!ent) return NextResponse.json({ error: "Підприємство не знайдено або не належить вам" }, { status: 404 });

      // Check no active listing for this enterprise
      const existing = await prisma.maDeal.findFirst({
        where: { targetEnterpriseId: body.targetEnterpriseId, status: "PENDING" },
      });
      if (existing) return NextResponse.json({ error: "Це підприємство вже виставлено на продаж" }, { status: 409 });
    }

    const lastTick = await prisma.gameTick.findFirst({ orderBy: { tickNumber: "desc" }, select: { tickNumber: true } });
    const currentTick = lastTick?.tickNumber ?? 1n;

    const deal = await prisma.maDeal.create({
      data: {
        sellerId:             playerId,
        targetEnterpriseId:   body.targetEnterpriseId ?? null,
        transactionAmountUah: body.priceUah,
        listedAtTick:         currentTick,
        notes:                body.notes ?? null,
      },
    });

    return NextResponse.json({ ok: true, dealId: deal.id }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Помилка";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
