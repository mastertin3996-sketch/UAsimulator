import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CompanyService } from "@/engine/CompanyService";
import { EQUIPMENT_CATALOG, DEFAULT_EQUIPMENT_SPEC } from "@/config/equipmentCatalog";

type Params = { params: Promise<{ id: string }> };

// GET — list equipment catalog items (isEquipmentItem=true) available to buy
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: workshopId } = await params;

  const workshop = await prisma.workshop.findUnique({
    where:  { id: workshopId },
    select: {
      id: true, footprintM2: true,
      _count: { select: { equipment: true } },
      enterprise: { select: { type: true } },
    },
  });

  if (!workshop) return NextResponse.json({ error: "Цех не знайдено" }, { status: 404 });

  const entType = workshop.enterprise.type;
  const RETAIL_SKUS = ['EQ-CASHREGISTER','EQ-POSTERMINAL','EQ-SHELVING','EQ-DISPLAYFRIDGE',
                       'EQ-FREEZER','EQ-CCTV','EQ-SCALE','EQ-PRICETAG','EQ-SELFCHECKOUT','EQ-CONVEYOR'];
  const OFFICE_SKUS = ['EQ-DESK','EQ-OFFCHAIR','EQ-COMPUTER','EQ-PRINTER','EQ-PROJECTOR',
                       'EQ-SERVER','EQ-PBXPHONE','EQ-AIRCON','EQ-COFFEEMACH','EQ-OFFICESAFE'];
  const FACTORY_SKUS = ['EQ-MILLGRIND','EQ-OILPRESS','EQ-FURNACE','EQ-TRACTOR','EQ-SAWMILL','EQ-DAIRYLINE'];
  // entType is Prisma EnterpriseType string; triple-equals comparison
  const allowedSkus = entType === 'RETAIL_STORE' ? RETAIL_SKUS
                    : entType === 'OFFICE'        ? OFFICE_SKUS
                    : FACTORY_SKUS;

  const catalogItems = await prisma.product.findMany({
    where:   { isEquipmentItem: true, sku: { in: allowedSkus } },
    select:  {
      id: true, nameUa: true, unit: true, sku: true,
      npcDemand: { select: { referencePrice: true }, take: 1 },
    },
    orderBy: { nameUa: "asc" },
  });

  const getFootprint = (sku: string) =>
    (EQUIPMENT_CATALOG[sku] ?? DEFAULT_EQUIPMENT_SPEC).footprintM2;

  // freeM2 обчислюється з реальних даних equipment у цеху
  const installedEquip = await prisma.equipment.findMany({
    where: { workshopId },
    select: { catalogProduct: { select: { sku: true } } },
  });
  const usedM2  = installedEquip.reduce((s, e) => s + getFootprint(e.catalogProduct.sku), 0);
  const freeM2  = workshop.footprintM2 - usedM2;

  return NextResponse.json({
    workshopId,
    freeM2,
    maxSlots: catalogItems.length,
    catalog: catalogItems.map((p) => {
      const spec = EQUIPMENT_CATALOG[p.sku] ?? DEFAULT_EQUIPMENT_SPEC;
      return {
        id:                  p.id,
        name:                p.nameUa,
        sku:                 p.sku,
        basePrice:           Number(p.npcDemand[0]?.referencePrice ?? spec.basePriceUah),
        unit:                p.unit,
        footprintM2:         spec.footprintM2,
        energyConsumptionKw: spec.energyConsumptionKw,
        canBuy:              freeM2 >= spec.footprintM2,
      };
    }),
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
    const product = await prisma.product.findUnique({ where: { id: body.productId }, select: { sku: true } });
    const footprintM2 = product
      ? (EQUIPMENT_CATALOG[product.sku] ?? DEFAULT_EQUIPMENT_SPEC).footprintM2
      : DEFAULT_EQUIPMENT_SPEC.footprintM2;

    const svc = new CompanyService(prisma);
    const eqId = await svc.installEquipment(playerId, {
      workshopId,
      productId:   body.productId,
      footprintM2,
      priceUah:    body.priceUah,
    });
    return NextResponse.json({ ok: true, equipmentId: eqId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Помилка";
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}
