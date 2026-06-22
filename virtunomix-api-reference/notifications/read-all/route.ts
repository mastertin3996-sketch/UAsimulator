import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/notifications/read-all?types=STRIKE,EQUIPMENT_BROKEN
// Marks all (or filtered by types) notifications as read.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const typesParam = req.nextUrl.searchParams.get("types");
  const types = typesParam ? typesParam.split(",").filter(Boolean) : [];

  const { count } = await prisma.notification.updateMany({
    where: {
      userId: session.user.id,
      isRead: false,
      ...(types.length > 0 ? { type: { in: types } } : {}),
    },
    data: { isRead: true },
  });

  return NextResponse.json({ updated: count });
}
