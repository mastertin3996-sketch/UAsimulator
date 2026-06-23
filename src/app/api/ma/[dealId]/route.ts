import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// DELETE — cancel listing (seller only)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ dealId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;
  const { dealId } = await params;

  const deal = await prisma.maDeal.findUnique({ where: { id: dealId } });
  if (!deal) return NextResponse.json({ error: "Угода не знайдена" }, { status: 404 });
  if (deal.sellerId !== playerId) return NextResponse.json({ error: "Ви не продавець" }, { status: 403 });
  if (deal.status !== "PENDING") return NextResponse.json({ error: "Угода вже не активна" }, { status: 409 });

  const lastTick = await prisma.gameTick.findFirst({ orderBy: { tickNumber: "desc" }, select: { tickNumber: true } });
  const currentTick = lastTick?.tickNumber ?? 1n;

  await prisma.maDeal.update({
    where: { id: dealId },
    data: { status: "CANCELED", canceledAtTick: currentTick },
  });

  return NextResponse.json({ ok: true });
}
