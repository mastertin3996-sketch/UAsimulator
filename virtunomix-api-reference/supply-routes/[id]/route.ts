import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const company = await prisma.company.findFirst({ where: { ownerId: session.user.id } });
  if (!company) return NextResponse.json({ error: "Компанія не знайдена" }, { status: 404 });

  const route = await prisma.internalSupplyRoute.findFirst({
    where: { id, companyId: company.id },
  });
  if (!route) return NextResponse.json({ error: "Маршрут не знайдено" }, { status: 404 });

  await prisma.internalSupplyRoute.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json() as { qtyPerTick?: number; isActive?: boolean };

  const company = await prisma.company.findFirst({ where: { ownerId: session.user.id } });
  if (!company) return NextResponse.json({ error: "Компанія не знайдена" }, { status: 404 });

  const route = await prisma.internalSupplyRoute.findFirst({
    where: { id, companyId: company.id },
  });
  if (!route) return NextResponse.json({ error: "Маршрут не знайдено" }, { status: 404 });

  const updated = await prisma.internalSupplyRoute.update({
    where: { id },
    data: {
      ...(body.qtyPerTick !== undefined ? { qtyPerTick: body.qtyPerTick } : {}),
      ...(body.isActive   !== undefined ? { isActive:   body.isActive   } : {}),
    },
  });
  return NextResponse.json({ route: updated });
}
