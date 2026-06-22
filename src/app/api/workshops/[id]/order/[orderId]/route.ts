import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string; orderId: string }> };

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;
  const { id: workshopId, orderId } = await params;

  const order = await prisma.productionOrder.findFirst({
    where: { id: orderId, workshopId, workshop: { enterprise: { playerId } } },
  });
  if (!order) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  await prisma.productionOrder.update({
    where: { id: orderId },
    data: { status: "CANCELLED" },
  });

  return NextResponse.json({ ok: true });
}
