/**
 * POST /api/workshops/:wid/lines — додати виробничу лінію до цеху
 * Body: { name: string }
 *
 * PATCH /api/workshops/:wid/lines/:lid — не тут, у /api/lines/[lid]/route.ts
 */
import { NextRequest, NextResponse } from "next/server";
import { auth }                      from "@/lib/auth";
import { prisma }                    from "@/lib/prisma";
import { LINE_COST }                 from "@/lib/equipment-config";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ wid: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { wid } = await params;
  const { name } = await req.json() as { name?: string };

  const workshop = await prisma.workshop.findUnique({
    where  : { id: wid },
    select : {
      id      : true,
      maxLines: true,
      isActive: true,
      _count  : { select: { lines: true } },
      office  : { select: { enterprise: { select: { company: { select: { ownerId: true } } } } } },
    },
  });

  if (!workshop)                                                             return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (workshop.office.enterprise.company.ownerId !== session.user.id)        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!workshop.isActive)                                                    return NextResponse.json({ error: "Цех неактивний" }, { status: 400 });
  if (workshop._count.lines >= workshop.maxLines) {
    return NextResponse.json({ error: `Ліміт ліній (${workshop.maxLines}). Підвищте рівень цеху.` }, { status: 400 });
  }

  const wallet = await prisma.userWallet.findUnique({ where: { userId: session.user.id } });
  if (!wallet || Number(wallet.gameCash) < LINE_COST) {
    return NextResponse.json({ error: `Недостатньо GC. Потрібно ${LINE_COST.toLocaleString()} GC` }, { status: 400 });
  }

  const lineName = name?.trim() || `Лінія ${workshop._count.lines + 1}`;

  const [line] = await prisma.$transaction([
    prisma.productionLine.create({
      data: { workshopId: wid, name: lineName, level: 1 },
    }),
    prisma.userWallet.update({
      where: { userId: session.user.id },
      data : { gameCash: { decrement: LINE_COST } },
    }),
  ]);

  return NextResponse.json({ ok: true, line, cost: LINE_COST }, { status: 201 });
}
