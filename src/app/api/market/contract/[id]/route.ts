import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const playerId = session.user.id;

  const contract = await prisma.autoContract.findFirst({
    where: { id, OR: [{ buyerId: playerId }, { sellerId: playerId }] },
  });
  if (!contract) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  await prisma.autoContract.delete({ where: { id } });
  return NextResponse.json({ ok: true, status: "TERMINATED" });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const playerId = session.user.id;
  const { action } = await req.json();

  const contract = await prisma.autoContract.findFirst({
    where: { id, OR: [{ buyerId: playerId }, { sellerId: playerId }] },
  });
  if (!contract) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });

  const isActive = action === "resume";
  await prisma.autoContract.update({ where: { id }, data: { isActive } });

  return NextResponse.json({ ok: true, status: isActive ? "ACTIVE" : "PAUSED" });
}
