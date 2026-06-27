import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const INTEL_COST = 15_000;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const reports = await prisma.intelligenceReport.findMany({
    where:   { requesterId: session.user.id },
    include: { target: { select: { username: true, companyName: true } } },
    orderBy: { createdAt: "desc" },
    take:    20,
  });

  // List of players to spy on
  const targets = await prisma.player.findMany({
    where:   { isNpcSeller: false, id: { not: session.user.id } },
    select:  { id: true, username: true, companyName: true },
    orderBy: { companyName: "asc" },
  });

  return NextResponse.json({
    reports: reports.map(r => ({
      id:          r.id,
      targetName:  r.target.companyName,
      targetUser:  r.target.username,
      success:     r.success,
      detected:    r.detected,
      result:      r.resultJson,
      createdAt:   r.createdAt.toISOString(),
    })),
    targets,
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { targetId?: string };
  if (!body.targetId) return NextResponse.json({ error: "targetId обов'язковий" }, { status: 400 });
  if (body.targetId === session.user.id) return NextResponse.json({ error: "Не можна стежити за собою" }, { status: 400 });

  const player = await prisma.player.findUnique({ where: { id: session.user.id }, select: { cashBalance: true } });
  if (!player || Number(player.cashBalance) < INTEL_COST) {
    return NextResponse.json({ error: `Потрібно ₴${INTEL_COST.toLocaleString("uk-UA")} для розвідки` }, { status: 422 });
  }

  // Check if target has active SecuritySystem
  const security = await prisma.securitySystem.findFirst({
    where: { enterprise: { playerId: body.targetId, isOperational: true }, isActive: true },
  });

  let success  = true;
  let detected = false;

  if (security) {
    // 40% chance of failure + detection
    if (Math.random() < 0.40) {
      success  = false;
      detected = true;
      // Notify target
      await prisma.notification.create({
        data: {
          playerId: body.targetId,
          type:     "MACRO_EVENT",
          title:    "🔍 Спроба шпигунства виявлена",
          body:     "Ваша служба безпеки зафіксувала спробу конкурентної розвідки. Спробу заблоковано.",
        },
      }).catch(() => {});
    }
  }

  let resultJson = null;

  if (success) {
    // Gather intel: top retail listings + inventory snapshot
    const targetEnts = await prisma.enterprise.findMany({
      where:   { playerId: body.targetId, isOperational: true },
      select: {
        name: true, type: true,
        retailListings: { where: { isActive: true }, select: { pricePerUnit: true, product: { select: { sku: true, nameUa: true } } }, take: 5 },
        inventory: { orderBy: { quantity: "desc" }, select: { quantity: true, product: { select: { sku: true, nameUa: true } } }, take: 3 },
      },
      take: 5,
    });

    const target = await prisma.player.findUnique({
      where:  { id: body.targetId },
      select: { reputationScore: true, creditRating: true },
    });

    resultJson = {
      enterprises: targetEnts.map(e => ({
        name: e.name, type: e.type,
        prices:    e.retailListings.map(l => ({ sku: l.product.sku, name: l.product.nameUa, price: Number(l.pricePerUnit) })),
        inventory: e.inventory.map(i => ({ sku: i.product.sku, name: i.product.nameUa, qty: Number(i.quantity) })),
      })),
      reputation: target?.reputationScore,
      credit:     target?.creditRating,
    };
  }

  await prisma.$transaction([
    prisma.player.update({ where: { id: session.user.id }, data: { cashBalance: { decrement: INTEL_COST } } }),
    prisma.intelligenceReport.create({
      data: {
        requesterId: session.user.id,
        targetId:    body.targetId,
        costUah:     INTEL_COST,
        success,
        detected,
        resultJson: resultJson ?? undefined,
      },
    }),
  ]);

  return NextResponse.json({ ok: true, success, detected, result: resultJson, cost: INTEL_COST });
}
