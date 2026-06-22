import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/notifications/[id] — mark single notification as read
export async function PATCH(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const note = await prisma.notification.findUnique({
    where : { id },
    select: { userId: true },
  });

  if (!note || note.userId !== session.user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.notification.update({
    where: { id },
    data : { isRead: true },
  });

  return NextResponse.json({ ok: true });
}

// DELETE /api/notifications/[id] — delete a single notification
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const note = await prisma.notification.findUnique({
    where : { id },
    select: { userId: true },
  });

  if (!note || note.userId !== session.user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.notification.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
