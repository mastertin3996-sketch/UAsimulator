import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url    = new URL(req.url);
  const unread = url.searchParams.get("unread") === "true";
  const take   = Math.min(100, Number(url.searchParams.get("take") ?? "20"));
  const skip   = Number(url.searchParams.get("skip") ?? "0");
  const type   = url.searchParams.get("type") ?? "";

  const where = {
    userId: session.user.id,
    ...(unread        ? { isRead: false } : {}),
    ...(type          ? { type }           : {}),
  };

  const [notifications, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      skip,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: session.user.id, isRead: false } }),
  ]);

  return NextResponse.json({ notifications, total, unreadCount });
}
