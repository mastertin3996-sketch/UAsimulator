/**
 * POST /api/equipment/:eid/repair — ремонт обладнання
 * Body: { repairPct?: number }  (якщо не вказано → повний ремонт до 0%)
 */
import { NextRequest, NextResponse } from "next/server";
import { auth }                      from "@/lib/auth";
import { prisma }                    from "@/lib/prisma";
import { EQUIPMENT_TYPES, repairCost } from "@/lib/equipment-config";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eid: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { eid } = await params;
  const { repairPct } = await req.json().catch(() => ({})) as { repairPct?: number };

  const equipment = await prisma.lineEquipment.findUnique({
    where : { id: eid },
    select: {
      id             : true,
      equipmentTypeId: true,
      wearPercent    : true,
      line           : {
        select: {
          workshop: {
            select: {
              office: {
                select: {
                  enterprise: { select: { company: { select: { ownerId: true } } } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!equipment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (equipment.line.workshop.office.enterprise.company.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const spec    = EQUIPMENT_TYPES[equipment.equipmentTypeId];
  if (!spec) return NextResponse.json({ error: "Невідомий тип обладнання" }, { status: 400 });

  const currentWear   = Number(equipment.wearPercent);
  if (currentWear <= 0) return NextResponse.json({ error: "Обладнання не потребує ремонту" }, { status: 400 });

  const toRepairPct   = repairPct != null ? Math.min(repairPct, currentWear) : currentWear;
  const cost          = repairCost(spec, toRepairPct);
  const newWear       = Math.max(0, currentWear - toRepairPct);

  const wallet = await prisma.userWallet.findUnique({ where: { userId: session.user.id } });
  if (!wallet || Number(wallet.gameCash) < cost) {
    return NextResponse.json({ error: `Недостатньо GC. Потрібно ${cost.toLocaleString()} GC` }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.lineEquipment.update({
      where: { id: eid },
      data : { wearPercent: newWear },
    }),
    prisma.userWallet.update({
      where: { userId: session.user.id },
      data : { gameCash: { decrement: cost } },
    }),
  ]);

  return NextResponse.json({
    ok            : true,
    repairedPct   : toRepairPct,
    newWearPercent: newWear,
    cost,
    condition     : Math.round(100 - newWear),
  });
}
