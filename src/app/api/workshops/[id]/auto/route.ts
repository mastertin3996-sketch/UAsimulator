import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/workshops/[id]/auto  { autoHarvest?: boolean, autoFertilize?: boolean }
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: workshopId } = await params;

  const workshop = await prisma.workshop.findFirst({
    where: { id: workshopId, enterprise: { playerId: session.user.id } },
    select: { id: true },
  });
  if (!workshop) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  const body = await req.json().catch(() => ({})) as { autoHarvest?: boolean; autoFertilize?: boolean };
  const data: Record<string, boolean> = {};
  if (typeof body.autoHarvest  === 'boolean') data.autoHarvest  = body.autoHarvest;
  if (typeof body.autoFertilize === 'boolean') data.autoFertilize = body.autoFertilize;

  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Немає полів для оновлення" }, { status: 400 });

  const updated = await prisma.workshop.update({ where: { id: workshopId }, data, select: { autoHarvest: true, autoFertilize: true } });
  return NextResponse.json({ ok: true, ...updated });
}
