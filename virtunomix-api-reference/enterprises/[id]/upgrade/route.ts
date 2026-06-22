/**
 * POST /api/enterprises/:id/upgrade
 * Upgrade the enterprise to the next development stage.
 *
 * What happens:
 *   1. Charges GC upgrade cost
 *   2. Increments enterprise.level + updates workersMax
 *   3. Ensures EnterpriseOffice exists
 *   4. Creates new Workshop records for this stage
 *   5. Creates ProductionLine records with the enterprise's recipe
 *   6. Creates LineEquipment (fresh, 0% wear) for each line
 *   7. Creates LineWorker with the role required by the equipment
 *
 * After upgrade, production capacity is driven PURELY by
 * workshops + equipment (workshop-engine.ts), not by baseCapacity × level.
 */
import { NextRequest, NextResponse }  from "next/server";
import { auth }                       from "@/lib/auth";
import { prisma }                     from "@/lib/prisma";
import { getNextLevelDef }            from "@/lib/enterprise-level-config";
import { EQUIPMENT_TYPES }            from "@/lib/equipment-config";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: enterpriseId } = await params;

  const enterprise = await prisma.enterprise.findUnique({
    where  : { id: enterpriseId },
    select : {
      id              : true,
      level           : true,
      recipeId        : true,
      enterpriseTypeId: true,
      companyId       : true,
      office          : { select: { id: true, maxWorkshops: true } },
      company         : {
        select: {
          ownerId: true,
          owner  : { select: { wallet: { select: { gameCash: true } } } },
        },
      },
    },
  });

  if (!enterprise)
    return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  if (enterprise.company.ownerId !== session.user.id)
    return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });

  const nextDef = getNextLevelDef(enterprise.enterpriseTypeId, enterprise.level);
  if (!nextDef)
    return NextResponse.json({ error: "Підприємство вже на максимальному рівні розвитку" }, { status: 400 });
  if (typeof nextDef.upgradeCost !== "number")
    return NextResponse.json({ error: "Неможливо визначити вартість" }, { status: 500 });

  const cost    = nextDef.upgradeCost;
  const balance = Number(enterprise.company.owner.wallet?.gameCash ?? 0);
  if (balance < cost)
    return NextResponse.json({
      error: `Недостатньо коштів. Потрібно ${cost.toLocaleString()} GC`,
    }, { status: 402 });

  // Current tick (for installedTick on equipment)
  const lastTick = await prisma.gameTick.findFirst({
    orderBy: { tickNumber: "desc" },
    select : { id: true, tickNumber: true },
  });
  const currentTick = lastTick?.tickNumber ?? 1;

  const createdWorkshopNames: string[] = [];
  const createdLineNames: string[] = [];

  await prisma.$transaction(async (tx) => {
    // 1. Charge GC
    await tx.userWallet.update({
      where: { userId: enterprise.company.ownerId },
      data : { gameCash: { decrement: cost } },
    });

    // 2. Financial log
    if (lastTick) {
      await tx.financialTransaction.create({
        data: {
          companyId      : enterprise.companyId,
          tickId         : lastTick.id,
          type           : "MAINTENANCE",
          currency       : "GAME_CASH",
          amount         : -cost,
          balanceAfter   : balance - cost,
          description    : `Розвиток підприємства до стадії ${nextDef.level}: «${nextDef.label}»`,
          relatedEntityId: enterpriseId,
        },
      });
    }

    // 3. Increment level + workersMax
    await tx.enterprise.update({
      where: { id: enterpriseId },
      data : { level: nextDef.level, workersMax: nextDef.workersMax },
    });

    // 4. Ensure office exists
    let officeId = enterprise.office?.id ?? null;
    const existingWsCount = officeId
      ? await tx.workshop.count({ where: { officeId } })
      : 0;
    const newMaxWorkshops = existingWsCount + nextDef.newWorkshops.length;

    if (!officeId) {
      const office = await tx.enterpriseOffice.create({
        data: { enterpriseId, level: 1, maxWorkshops: Math.max(newMaxWorkshops, 2) },
      });
      officeId = office.id;
    } else {
      await tx.enterpriseOffice.update({
        where: { id: officeId },
        data : { maxWorkshops: Math.max(enterprise.office!.maxWorkshops, newMaxWorkshops) },
      });
    }

    // 5. Create workshops + their lines + equipment
    for (const wsDef of nextDef.newWorkshops) {
      // Lines for this workshop from the stage config
      const lineDefs = nextDef.newLines.filter((l) => l.workshopName === wsDef.name);

      const workshop = await tx.workshop.create({
        data: {
          officeId,
          type    : wsDef.type,
          name    : wsDef.name,
          level   : 1,
          maxLines: Math.max(lineDefs.length, 2),
          isActive: true,
        },
      });
      createdWorkshopNames.push(wsDef.name);

      // 6. Create lines for this workshop
      for (const lineDef of lineDefs) {
        const spec = EQUIPMENT_TYPES[lineDef.equipmentTypeId];

        const line = await tx.productionLine.create({
          data: {
            workshopId: workshop.id,
            recipeId  : spec && spec.maxThroughput > 0 ? (enterprise.recipeId ?? null) : null,
            name      : lineDef.name,
            level     : 1,
            isActive  : true,
            loadFactor: 1.0,
          },
        });
        createdLineNames.push(lineDef.name);

        // 7. Install equipment
        await tx.lineEquipment.create({
          data: {
            lineId         : line.id,
            equipmentTypeId: lineDef.equipmentTypeId,
            wearPercent    : 0,
            installedTick  : currentTick,
          },
        });

        // 8. Assign required worker role to the line
        if (spec?.requiredProfession) {
          await tx.lineWorker.create({
            data: {
              lineId: line.id,
              roleId: spec.requiredProfession,
            },
          });
        }
      }
    }
  });

  return NextResponse.json({
    ok              : true,
    newLevel        : nextDef.level,
    label           : nextDef.label,
    cost,
    createdWorkshops: createdWorkshopNames,
    createdLines    : createdLineNames,
  });
}
