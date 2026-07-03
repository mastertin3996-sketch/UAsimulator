import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const updateSupplyRouteSchema = z.object({
  qtyPerTick: z.number().finite().optional(),
  isActive:   z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const playerId = session.user.id;
  const { id } = await params;

  const rawBody = await req.json().catch(() => null);
  const parsed  = updateSupplyRouteSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Некоректні дані запиту" }, { status: 400 });
  }
  const body = parsed.data;

  const route = await prisma.supplyRoute.findFirst({ where: { id, playerId }, select: { id: true } });
  if (!route) return NextResponse.json({ error: "Маршрут не знайдено" }, { status: 404 });

  if (body.qtyPerTick !== undefined && body.qtyPerTick <= 0) {
    return NextResponse.json({ error: "qtyPerTick має бути > 0" }, { status: 400 });
  }

  await prisma.supplyRoute.update({
    where: { id },
    data: {
      ...(body.qtyPerTick !== undefined ? { qtyPerTick: body.qtyPerTick } : {}),
      ...(body.isActive   !== undefined ? { isActive:   body.isActive   } : {}),
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const playerId = session.user.id;
  const { id } = await params;

  const route = await prisma.supplyRoute.findFirst({ where: { id, playerId }, select: { id: true } });
  if (!route) return NextResponse.json({ error: "Маршрут не знайдено" }, { status: 404 });

  await prisma.supplyRoute.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
