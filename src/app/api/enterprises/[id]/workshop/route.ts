import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

const createWorkshopSchema = z.object({
  name:        z.string().min(1).optional(),
  footprintM2: z.number().finite().positive().optional(),
  maxCapacity: z.number().finite().positive().optional(),
});

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;
  const { id: enterpriseId } = await params;

  const enterprise = await prisma.enterprise.findFirst({
    where: { id: enterpriseId, playerId },
    select: { id: true, totalFloorAreaM2: true, usedFloorAreaM2: true, isOperational: true },
  });
  if (!enterprise) return NextResponse.json({ error: "Підприємство не знайдено" }, { status: 404 });
  if (!enterprise.isOperational) return NextResponse.json({ error: "Підприємство ще не збудовано" }, { status: 400 });

  const rawBody = await req.json().catch(() => null);
  const parsed  = createWorkshopSchema.safeParse(rawBody ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Некоректні дані запиту" }, { status: 400 });
  }
  const body = parsed.data;

  const name        = body.name?.trim() ?? "Цех 1";
  const footprintM2 = body.footprintM2 ?? 200;
  const maxCapacity = body.maxCapacity ?? 100;

  const freeArea = enterprise.totalFloorAreaM2 - enterprise.usedFloorAreaM2;
  if (footprintM2 > freeArea) {
    return NextResponse.json({ error: `Недостатньо площі. Вільно ${freeArea} м²` }, { status: 400 });
  }

  const workshop = await prisma.$transaction(async (tx) => {
    const ws = await tx.workshop.create({
      data: {
        enterpriseId, name, footprintM2, maxCapacity,
        currentVolume: maxCapacity * 0.8,
        isActive: true,
      },
    });
    await tx.enterprise.update({
      where: { id: enterpriseId },
      data: { usedFloorAreaM2: { increment: footprintM2 } },
    });
    return ws;
  });

  return NextResponse.json({ ok: true, workshop: { id: workshop.id, name: workshop.name } }, { status: 201 });
}
