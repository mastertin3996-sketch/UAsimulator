import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { count } = await prisma.notification.updateMany({
    where: { playerId: session.user.id, isRead: false },
    data:  { isRead: true },
  });

  return NextResponse.json({ ok: true, marked: count });
}
