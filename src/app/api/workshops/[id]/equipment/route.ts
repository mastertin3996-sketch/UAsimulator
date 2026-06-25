import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CompanyService } from "@/engine/CompanyService";

type Params = { params: Promise<{ id: string }> };

// GET — list equipment catalog items (isEquipmentItem=true) available to buy
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: workshopId } = await params;

  const [workshop, catalogItems] = await Promise.all([
    prisma.workshop.findUnique({
      where:  { id: workshopId },
      select: { id: true, footprintM2: true, _count: { select: { equipment: true } } },
    }),
    prisma.product.findMany({
      where:   { isEquipmentItem: true },
      select:  {
        id: true, nameUa: true, unit: true,
        npcDemand: { select: { referencePrice: true }, take: 1 },
      },
      orderBy: { nameUa: "asc" },
    }),
  ]);

  if (!workshop) return NextResponse.json({ error: "Цех не знайдено" }, { status: 404 });

  const FOOTPRINT = 30;
  const usedM2    = workshop._count.equipment * FOOTPRINT;
  const freeM2    = workshop.footprintM2 - usedM2;
  const maxSlots  = Math.floor(freeM2 / FOOTPRINT);

  return NextResponse.json({
    workshopId,
    freeM2,
    maxSlots,
    catalog: catalogItems.map((p) => ({
      id:          p.id,
      name:        p.nameUa,
      basePrice:   Number(p.npcDemand[0]?.referencePrice ?? 50_000),
      unit:        p.unit,
      footprintM2: FOOTPRINT,
    })),
  });
}

// POST — install equipment: { productId, priceUah }
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: workshopId } = await params;
  const playerId = session.user.id;
  const body = await req.json().catch(() => ({})) as { productId?: string; priceUah?: number };

  if (!body.productId || !body.priceUah || body.priceUah <= 0) {
    return NextResponse.json({ error: "productId і priceUah обов'язкові" }, { status: 400 });
  }

  try {
    const svc = new CompanyService(prisma);
    const eqId = await svc.installEquipment(playerId, {
      workshopId,
      productId:   body.productId,
      footprintM2: 30,
      priceUah:    body.priceUah,
    });
    return NextResponse.json({ ok: true, equipmentId: eqId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Помилка";
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}
