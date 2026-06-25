import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function isVirtual(id: string) { return id.startsWith("v-"); }

export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (isVirtual(id)) return NextResponse.json({ ok: true });

  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.notification.updateMany({
    where: { id, playerId: session.user.id },
    data:  { isRead: true },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (isVirtual(id)) return NextResponse.json({ ok: true });

  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.notification.deleteMany({
    where: { id, playerId: session.user.id },
  });
  return NextResponse.json({ ok: true });
}
