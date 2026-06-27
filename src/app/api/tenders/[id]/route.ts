import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TenderService } from "@/engine/TenderService";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: tenderId } = await params;
  const { enterpriseId } = await req.json();

  if (!enterpriseId) return NextResponse.json({ error: "enterpriseId required" }, { status: 400 });

  // Verify enterprise belongs to player
  const ent = await prisma.enterprise.findFirst({ where: { id: enterpriseId, playerId: session.user.id } });
  if (!ent) return NextResponse.json({ error: "Підприємство не знайдено" }, { status: 404 });

  const svc    = new TenderService(prisma);
  const result = await svc.fulfillTender(tenderId, session.user.id, enterpriseId);

  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 422 });
  return NextResponse.json({ ok: true, revenueUah: result.revenueUah, message: result.message });
}
