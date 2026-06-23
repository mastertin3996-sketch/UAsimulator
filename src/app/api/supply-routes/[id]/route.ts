import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const playerId = session.user.id;
  const { id } = await params;

  const body = await req.json().catch(() => ({})) as {
    qtyPerTick?: number;
    isActive?:   boolean;
  };

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
