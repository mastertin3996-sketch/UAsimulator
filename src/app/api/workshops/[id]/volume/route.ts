import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const updateVolumeSchema = z.object({
  currentVolume: z.number().finite().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;
  const { id: workshopId } = await params;

  const workshop = await prisma.workshop.findFirst({
    where: { id: workshopId, enterprise: { playerId } },
    select: { id: true, maxCapacity: true },
  });
  if (!workshop) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  const rawBody = await req.json().catch(() => null);
  const parsed  = updateVolumeSchema.safeParse(rawBody ?? {});
  if (!parsed.success) return NextResponse.json({ error: "currentVolume має бути числом" }, { status: 400 });
  const body = parsed.data;
  const volume = body.currentVolume ?? 0;

  if (volume < 0 || volume > workshop.maxCapacity) {
    return NextResponse.json({ error: `Обсяг має бути 0–${workshop.maxCapacity}` }, { status: 400 });
  }

  await prisma.workshop.update({ where: { id: workshopId }, data: { currentVolume: volume } });
  return NextResponse.json({ ok: true, currentVolume: volume });
}
