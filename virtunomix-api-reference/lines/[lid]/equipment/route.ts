/**
 * POST /api/lines/:lid/equipment — встановити обладнання на лінію (купівля у NPC)
 * Body: { equipmentTypeId: string }
 *
 * DELETE /api/lines/:lid/equipment/:eid — демонтувати обладнання (без відшкодування)
 */
import { NextRequest, NextResponse }             from "next/server";
import { auth }                                  from "@/lib/auth";
import { prisma }                                from "@/lib/prisma";
import { EQUIPMENT_TYPES, npcBuyPrice }          from "@/lib/equipment-config";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ lid: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { lid } = await params;
  const { equipmentTypeId } = await req.json() as { equipmentTypeId: string };

  if (!equipmentTypeId) return NextResponse.json({ error: "equipmentTypeId обов'язковий" }, { status: 400 });

  const spec = EQUIPMENT_TYPES[equipmentTypeId];
  if (!spec) return NextResponse.json({ error: "Невідомий тип обладнання" }, { status: 404 });

  const line = await prisma.productionLine.findUnique({
    where : { id: lid },
    select: {
      id        : true,
      isActive  : true,
      _count    : { select: { equipment: true } },
      workshop  : {
        select: {
          type: true,
          office: {
            select: {
              enterprise: { select: { company: { select: { ownerId: true } } } },
            },
          },
        },
      },
    },
  });

  if (!line)                                                              return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (line.workshop.office.enterprise.company.ownerId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (line._count.equipment >= 1) {
    return NextResponse.json({ error: "На лінії вже встановлено обладнання. Демонтуйте спочатку." }, { status: 400 });
  }
  if (spec.workshopType !== line.workshop.type) {
    return NextResponse.json({
      error: `Обладнання «${spec.name}» призначено для цеху ${spec.workshopType}, а не ${line.workshop.type}`,
    }, { status: 400 });
  }

  const price  = npcBuyPrice(spec);
  const wallet = await prisma.userWallet.findUnique({ where: { userId: session.user.id } });
  if (!wallet || Number(wallet.gameCash) < price) {
    return NextResponse.json({ error: `Недостатньо GC. Потрібно ${price.toLocaleString()} GC` }, { status: 400 });
  }

  // Отримуємо поточний тік
  const lastTick = await prisma.gameTick.findFirst({ orderBy: { tickNumber: "desc" }, select: { tickNumber: true } });
  const tickNow  = lastTick?.tickNumber ?? 0;

  const [equipment] = await prisma.$transaction([
    prisma.lineEquipment.create({
      data: { lineId: lid, equipmentTypeId, wearPercent: 0, installedTick: tickNow },
    }),
    // Авто-призначаємо LineWorker для потрібної професії
    prisma.lineWorker.upsert({
      where : { lineId_roleId: { lineId: lid, roleId: spec.requiredProfession } },
      update: {},
      create: { lineId: lid, roleId: spec.requiredProfession },
    }),
    prisma.userWallet.update({
      where: { userId: session.user.id },
      data : { gameCash: { decrement: price } },
    }),
  ]);

  return NextResponse.json({
    ok       : true,
    equipment,
    workerRoleAssigned: spec.requiredProfession,
    cost     : price,
    spec     : { name: spec.name, wearRate: spec.wearRate, requiredProfession: spec.requiredProfession },
  }, { status: 201 });
}
