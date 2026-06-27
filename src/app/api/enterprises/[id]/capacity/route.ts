import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CapacityService } from "@/engine/CapacityService";
import { ENTERPRISE_REQUIREMENTS, DEFAULT_REQUIREMENTS } from "@/config/productionRequirements";

type Params = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: enterpriseId } = await params;

  const enterprise = await prisma.enterprise.findFirst({
    where:   { id: enterpriseId, playerId: session.user.id },
    include: {
      employees: { select: { isOnStrike: true } },
      workshops: {
        where:   { isActive: true },
        include: { equipment: { select: { isBroken: true, wearAndTear: true, catalogProductId: true } } },
      },
    },
  });
  if (!enterprise) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Build productId → sku map for EQ-* products
  const eqProducts = await prisma.product.findMany({
    where:  { sku: { startsWith: "EQ-" } },
    select: { id: true, sku: true },
  });
  const productIdToSku = new Map(eqProducts.map(p => [p.id, p.sku]));

  const activeStaffCount = enterprise.employees.filter(e => !e.isOnStrike).length;
  const cfg = ENTERPRISE_REQUIREMENTS[enterprise.type] ?? DEFAULT_REQUIREMENTS;

  const workshops = enterprise.workshops.map(ws => {
    const operationalEquipSkus = ws.equipment
      .filter(eq => !eq.isBroken && eq.wearAndTear < 1.0)
      .map(eq => productIdToSku.get(eq.catalogProductId) ?? "")
      .filter(Boolean);

    const result = CapacityService.compute({
      enterpriseType:           enterprise.type,
      activeStaffCount,
      workshopAreaM2:           ws.footprintM2,
      installedEquipmentCount:  ws.equipment.filter(eq => !eq.isBroken).length,
      operationalEquipmentSkus: operationalEquipSkus,
    });

    return {
      workshopId:  ws.id,
      workshopName: ws.name,
      footprintM2: ws.footprintM2,
      canProduce:  result.canProduce,
      multiplier:  result.multiplier,
      reason:      result.reason ?? null,
      breakdown:   result.breakdown,
    };
  });

  const recommendedStaff = workshops.length > 0
    ? Math.max(cfg.minStaff, Math.ceil(enterprise.workshops.reduce((s, w) => s + w.footprintM2, 0) * cfg.recommendedStaffPer100m2 / 100))
    : cfg.minStaff;

  return NextResponse.json({
    enterpriseType:    enterprise.type,
    activeStaff:       activeStaffCount,
    totalStaff:        enterprise.employees.length,
    minStaff:          cfg.minStaff,
    recommendedStaff,
    minWorkshopAreaM2: cfg.minWorkshopAreaM2,
    minEquipmentUnits: cfg.minEquipmentUnits,
    requiredEquipmentSkus: cfg.requiredEquipmentSkus,
    workshops,
  });
}
