/**
 * GET  /api/enterprises/:id/workshops  — повна ієрархія: офіс → цехи → лінії
 * POST /api/enterprises/:id/workshops  — побудувати новий цех
 *   Body: { type: WorkshopType, name: string }
 */
import { NextRequest, NextResponse }   from "next/server";
import { auth }                        from "@/lib/auth";
import { prisma }                      from "@/lib/prisma";
import { OFFICE_OPEN_COST, WORKSHOP_COST, workshopUpgradeCost, EQUIPMENT_TYPES, allowedWorkshopTypes, npcBuyPrice, repairCost } from "@/lib/equipment-config";
import type { WorkshopType }           from "@/generated/prisma/client";

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: enterpriseId } = await params;

  const enterprise = await prisma.enterprise.findUnique({
    where  : { id: enterpriseId },
    select : {
      id              : true,
      enterpriseTypeId: true,
      company         : { select: { ownerId: true } },
      office          : {
        select: {
          id          : true,
          level       : true,
          maxWorkshops: true,
          workshops   : {
            orderBy: { id: "asc" },
            select : {
              id      : true,
              type    : true,
              name    : true,
              level   : true,
              maxLines: true,
              isActive: true,
              lines   : {
                orderBy: { id: "asc" },
                select : {
                  id        : true,
                  name      : true,
                  level     : true,
                  recipeId  : true,
                  isActive  : true,
                  loadFactor: true,
                  recipe    : { select: { name: true, outputAmount: true, outputProduct: { select: { name: true, unit: true } } } },
                  equipment : {
                    select: { id: true, equipmentTypeId: true, wearPercent: true, installedTick: true },
                  },
                  workers: { select: { id: true, roleId: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!enterprise) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (enterprise.company.ownerId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Рецепти, доступні для цього типу підприємства
  const availableRecipes = await prisma.productionRecipe.findMany({
    where  : { enterpriseTypeId: enterprise.enterpriseTypeId },
    select : {
      id            : true,
      name          : true,
      outputAmount  : true,
      outputProduct : { select: { id: true, name: true, unit: true, icon: true } },
      inputs        : { select: { product: { select: { id: true, name: true, unit: true } }, amount: true } },
    },
    orderBy: { name: "asc" },
  });

  const recipesForClient = availableRecipes.map((r) => ({
    ...r,
    outputAmount: Number(r.outputAmount),
    inputs      : r.inputs.map((i) => ({ ...i, amount: Number(i.amount) })),
  }));

  if (!enterprise.office) {
    return NextResponse.json({
      hasOffice       : false,
      openCost        : OFFICE_OPEN_COST,
      availableRecipes: recipesForClient,
      allowedWorkshopTypes: allowedWorkshopTypes(enterprise.enterpriseTypeId),
    });
  }

  const office = enterprise.office;

  // Збагачуємо лінії: конвертуємо Decimal → number, кладемо enriched-дані НА кожен equipment item
  // Також розраховуємо потужність "знизу догори":
  //   line_max_throughput = spec.maxThroughput × line.level × recipe.outputAmount  (при стані 100%, mood 100%, load 100%)
  //   line_effective      = line_max_throughput × equipCondition × load  (mood невідомий тут — використовуємо 100% для "max")
  const enrichedWorkshops = office.workshops.map((ws) => {
    let wsMaxCapacity = 0;
    let wsEffCapacity = 0;

    const enrichedLines = ws.lines.map((line) => {
      const loadFactor    = Math.max(0, Math.min(1, Number(line.loadFactor ?? 1)));
      const recipeOut     = line.recipe ? Number(line.recipe.outputAmount) : null;
      const equip         = line.equipment[0] ?? null;
      const spec          = equip ? (EQUIPMENT_TYPES[equip.equipmentTypeId] ?? null) : null;
      const eqWear        = equip ? Number(equip.wearPercent) : 100;
      const equipCondition = equip ? (100 - eqWear) / 100 : 0;

      // Потужність лінії
      // max = якби стан=100%, load=100%
      const lineMax  = (recipeOut != null && spec) ? recipeOut * spec.maxThroughput * line.level : null;
      // eff = з реальним станом і поточним loadFactor (mood вважаємо 1.0 — він відомий лише на tick)
      const lineEff  = lineMax != null ? lineMax * equipCondition * loadFactor : null;

      if (lineMax != null) wsMaxCapacity += lineMax;
      if (lineEff != null) wsEffCapacity += lineEff;

      return {
        ...line,
        loadFactor,
        recipe: line.recipe
          ? { ...line.recipe, outputAmount: Number(line.recipe.outputAmount) }
          : null,
        // Capacity fields (без врахування mood — точне значення лише на тік)
        maxCapacityPerTick: lineMax != null ? Math.round(lineMax * 100) / 100 : null,
        effCapacityPerTick: lineEff != null ? Math.round(lineEff * 100) / 100 : null,
        equipment: line.equipment.map((eq) => {
          const eqW = Number(eq.wearPercent);
          const s   = EQUIPMENT_TYPES[eq.equipmentTypeId] ?? null;
          return {
            id              : eq.id,
            equipmentTypeId : eq.equipmentTypeId,
            installedTick   : eq.installedTick,
            wearPercent     : eqW,
            condition       : Math.round(100 - eqW),
            repairCost      : s ? repairCost(s, eqW) : 0,
            repairCostPerPct: s?.repairCostPerPct ?? 0,
            spec            : s ? {
              name              : s.name,
              icon              : s.icon,
              wearRate          : s.wearRate,
              requiredProfession: s.requiredProfession,
              maxThroughput     : s.maxThroughput,
            } : null,
          };
        }),
      };
    });

    return {
      ...ws,
      upgradeCost       : ws.level < 5 ? workshopUpgradeCost(ws.level + 1) : null,
      maxCapacityPerTick: Math.round(wsMaxCapacity * 100) / 100,
      effCapacityPerTick: Math.round(wsEffCapacity * 100) / 100,
      lines             : enrichedLines,
    };
  });

  return NextResponse.json({
    hasOffice       : true,
    availableRecipes: recipesForClient,
    office          : {
      ...office,
      workshops   : enrichedWorkshops,
      upgradeCost : office.level < 5 ? 5_000 * (office.level + 1) ** 2 : null,
      canAddWorkshop: office.workshops.length < office.maxWorkshops,
    },
    allowedWorkshopTypes: allowedWorkshopTypes(enterprise.enterpriseTypeId),
    workshopCost: WORKSHOP_COST,
  });
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: enterpriseId } = await params;
  const { type, name } = await req.json() as { type: WorkshopType; name: string };

  if (!type || !name?.trim()) {
    return NextResponse.json({ error: "type і name обов'язкові" }, { status: 400 });
  }

  const enterprise = await prisma.enterprise.findUnique({
    where  : { id: enterpriseId },
    select : {
      id              : true,
      enterpriseTypeId: true,
      company         : { select: { ownerId: true } },
      office          : { select: { id: true, level: true, maxWorkshops: true, _count: { select: { workshops: true } } } },
    },
  });

  if (!enterprise)                                    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (enterprise.company.ownerId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!enterprise.office)                             return NextResponse.json({ error: "Спочатку відкрийте офіс" }, { status: 400 });

  const { office } = enterprise;
  if (office._count.workshops >= office.maxWorkshops) {
    return NextResponse.json({ error: `Ліміт цехів досягнуто (${office.maxWorkshops}). Підвищте рівень офісу.` }, { status: 400 });
  }

  const allowed = allowedWorkshopTypes(enterprise.enterpriseTypeId);
  if (!allowed.includes(type)) {
    return NextResponse.json({ error: `Цех типу ${type} недоступний для цього підприємства` }, { status: 400 });
  }

  const wallet = await prisma.userWallet.findUnique({ where: { userId: session.user.id } });
  if (!wallet || Number(wallet.gameCash) < WORKSHOP_COST) {
    return NextResponse.json({ error: `Недостатньо GC. Потрібно ${WORKSHOP_COST.toLocaleString()} GC` }, { status: 400 });
  }

  const [workshop] = await prisma.$transaction([
    prisma.workshop.create({
      data: { officeId: office.id, type, name: name.trim(), level: 1, maxLines: 2 },
    }),
    prisma.userWallet.update({
      where: { userId: session.user.id },
      data : { gameCash: { decrement: WORKSHOP_COST } },
    }),
  ]);

  return NextResponse.json({ ok: true, workshop, cost: WORKSHOP_COST }, { status: 201 });
}
