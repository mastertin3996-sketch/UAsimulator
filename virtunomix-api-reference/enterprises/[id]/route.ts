import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLevelDef, getNextLevelDef, getCapacityMult } from "@/lib/enterprise-level-config";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const ent = await prisma.enterprise.findUnique({
    where: { id },
    include: {
      company: { select: { id: true, ownerId: true } },
      enterpriseType: {
        select: {
          name: true, category: true, icon: true,
          baseRentPerTick: true, baseCapacity: true, workersPerUnit: true,
        },
      },
      city: { select: { name: true, population: true, wealthIndex: true } },
      recipe: {
        include: {
          outputProduct: { select: { id: true, name: true, unit: true, basePrice: true, icon: true } },
          inputs: {
            include: {
              product: { select: { id: true, name: true, unit: true, basePrice: true, icon: true } },
            },
          },
        },
      },
      shopSettings: {
        include: {
          product: { select: { id: true, name: true, unit: true, basePrice: true, icon: true } },
        },
        orderBy: { id: "asc" as const },
      },
      inventory: {
        include: {
          product: { select: { id: true, name: true, unit: true, basePrice: true, icon: true } },
        },
        orderBy: { updatedAt: "desc" },
      },
    },
  });

  if (!ent) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  if (ent.company.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });
  }

  // Повний асортимент для TRADE (всі товари відповідних категорій)
  const STORE_PRODUCT_CATEGORIES: Record<string, string[]> = {
    "etype-supermarket":   ["cat-food", "cat-dairy", "cat-meat", "cat-confect", "cat-beverage", "cat-household", "cat-consumer"],
    "etype-grocery":       ["cat-food", "cat-dairy", "cat-veg"],
    "etype-hardware":      ["cat-household"],
    "etype-auto-showroom": ["cat-transport"],
    "etype-gas-station":   ["cat-fuel"],
  };
  const storeCats = ent.enterpriseType.category === "TRADE"
    ? (STORE_PRODUCT_CATEGORIES[ent.enterpriseTypeId] ?? [])
    : [];
  const catalogProducts = storeCats.length > 0
    ? await prisma.product.findMany({
        where : { categoryId: { in: storeCats }, isRawMaterial: false },
        select: { id: true, name: true, icon: true },
        orderBy: { name: "asc" },
      })
    : [];

  // Останні 5 тіків retail логів
  const retailHistory = await prisma.retailSalesLog.findMany({
    where: { enterpriseId: id },
    include: { tick: { select: { tickNumber: true } } },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  // TickEvents останнього тіку
  const lastTick = await prisma.gameTick.findFirst({
    orderBy: { tickNumber: "desc" },
    select: { id: true, tickNumber: true },
  });
  const tickEvents = lastTick
    ? await prisma.tickEvent.findMany({
        where: { tickId: lastTick.id, enterpriseId: id },
        select: { eventType: true, amount: true, description: true },
      })
    : [];

  const rentPerTick =
    Number(ent.enterpriseType.baseRentPerTick) * ent.size * (1 + 0.15 * (ent.level - 1));

  const currentLevelDef = getLevelDef(ent.enterpriseTypeId, ent.level);
  const nextLevelDef    = getNextLevelDef(ent.enterpriseTypeId, ent.level);
  const capMult         = getCapacityMult(ent.enterpriseTypeId, ent.level);
  const levelConfig = currentLevelDef ? {
    current: {
      level       : currentLevelDef.level,
      label       : currentLevelDef.label,
      description : currentLevelDef.description,
      capacityMult: currentLevelDef.capacityMult,
      workersMax  : currentLevelDef.workersMax,
    },
    next: nextLevelDef ? {
      level       : nextLevelDef.level,
      label       : nextLevelDef.label,
      description : nextLevelDef.description,
      capacityMult: nextLevelDef.capacityMult,
      workersMax  : nextLevelDef.workersMax,
      upgradeCost : nextLevelDef.upgradeCost,
      newWorkshops: nextLevelDef.newWorkshops.map((w) => ({ type: w.type, name: w.name })),
    } : null,
    effectiveCapacity: ent.enterpriseType.baseCapacity * capMult,
  } : null;
  const salaryPerTick = ent.workersCurrent * Number(ent.salaryOffered);

  return NextResponse.json({
    enterprise: {
      id: ent.id,
      name: ent.name,
      enterpriseTypeId: ent.enterpriseTypeId,
      typeName: ent.enterpriseType.name,
      typeIcon: ent.enterpriseType.icon,
      category: ent.enterpriseType.category,
      baseCapacity: ent.enterpriseType.baseCapacity,
      city: {
        name: ent.city.name,
        population: ent.city.population,
        wealthIndex: Number(ent.city.wealthIndex),
      },
      level: ent.level,
      size: ent.size,
      workersCurrent: ent.workersCurrent,
      workersMax: ent.workersMax,
      salaryOffered: Number(ent.salaryOffered),
      quality: Number(ent.quality),
      efficiency: Number(ent.efficiency),
      brandBonus: Number(ent.brandBonus),
      isActive: ent.isActive,
      createdAt: ent.createdAt,
      satisfaction : Number(ent.satisfaction),
      strikeEndsAt : ent.strikeEndsAt,
      rentPerTick,
      salaryPerTick,
      costsPerTick: rentPerTick + salaryPerTick,
      recipe: ent.recipe
        ? {
            id: ent.recipe.id,
            name: ent.recipe.name,
            outputProduct: ent.recipe.outputProduct,
            outputAmount: Number(ent.recipe.outputAmount),
            inputs: ent.recipe.inputs.map((inp) => ({
              product: inp.product,
              amount: Number(inp.amount),
            })),
          }
        : null,
      shopSettings: ent.shopSettings.map((s) => ({
        id          : s.id,
        productId   : s.productId,
        product     : s.product,
        retailPrice : Number(s.retailPrice),
        markupPct   : Number(s.markupPct),
        displayLimit: s.displayLimit,
        isActive    : s.isActive,
      })),
      inventory: ent.inventory.map((inv) => ({
        id: inv.id,
        productId: inv.productId,
        product: inv.product,
        quantity: Number(inv.quantity),
        reservedQty: Number(inv.reservedQty),
        available: Number(inv.quantity) - Number(inv.reservedQty),
        quality: Number(inv.quality),
        avgCost: Number(inv.avgCost),
      })),
      levelConfig,
      lastTickEvents: tickEvents.map((ev) => ({
        eventType: ev.eventType,
        amount: Number(ev.amount),
        description: ev.description,
      })),
      retailHistory: retailHistory.map((r) => ({
        tickNumber: r.tick.tickNumber,
        quantitySold: Number(r.quantitySold),
        price: Number(r.price),
        revenue: Number(r.revenue),
        demandFactor: Number(r.demandFactor),
      })),
      catalogProducts,
    },
  });
}
