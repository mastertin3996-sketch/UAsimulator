/**
 * POST /api/enterprises/:id/office
 * Відкриває офіс (рівень 1) або підвищує рівень існуючого.
 * Тіло: {} (відкрити) або { upgrade: true } (підвищити рівень)
 */
import { NextRequest, NextResponse } from "next/server";
import { auth }                      from "@/lib/auth";
import { prisma }                    from "@/lib/prisma";
import { OFFICE_OPEN_COST, officeUpgradeCost } from "@/lib/equipment-config";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: enterpriseId } = await params;
  const body = await req.json().catch(() => ({})) as { upgrade?: boolean };

  const enterprise = await prisma.enterprise.findUnique({
    where  : { id: enterpriseId },
    select : { id: true, company: { select: { ownerId: true } }, office: true },
  });
  if (!enterprise)                                     return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (enterprise.company.ownerId !== session.user.id)  return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const wallet = await prisma.userWallet.findUnique({ where: { userId: session.user.id } });
  if (!wallet) return NextResponse.json({ error: "No wallet" }, { status: 400 });

  // ── Відкрити офіс ─────────────────────────────────────────────────────────
  if (!enterprise.office) {
    const cost = OFFICE_OPEN_COST;
    if (Number(wallet.gameCash) < cost) {
      return NextResponse.json({ error: `Недостатньо GC. Потрібно ${cost.toLocaleString()} GC` }, { status: 400 });
    }

    const [office] = await prisma.$transaction([
      prisma.enterpriseOffice.create({
        data: { enterpriseId, level: 1, maxWorkshops: 2 },
      }),
      prisma.userWallet.update({
        where: { userId: session.user.id },
        data : { gameCash: { decrement: cost } },
      }),
    ]);

    return NextResponse.json({ ok: true, office, cost, action: "opened" }, { status: 201 });
  }

  // ── Підвищити рівень офісу ─────────────────────────────────────────────────
  if (body.upgrade) {
    const currentLevel = enterprise.office.level;
    if (currentLevel >= 5) {
      return NextResponse.json({ error: "Максимальний рівень офісу (5) досягнуто" }, { status: 400 });
    }
    const toLevel = currentLevel + 1;
    const cost    = officeUpgradeCost(toLevel);
    if (Number(wallet.gameCash) < cost) {
      return NextResponse.json({ error: `Недостатньо GC. Потрібно ${cost.toLocaleString()} GC` }, { status: 400 });
    }

    const [office] = await prisma.$transaction([
      prisma.enterpriseOffice.update({
        where: { enterpriseId },
        data : { level: toLevel, maxWorkshops: toLevel * 2 },
      }),
      prisma.userWallet.update({
        where: { userId: session.user.id },
        data : { gameCash: { decrement: cost } },
      }),
    ]);

    return NextResponse.json({ ok: true, office, cost, action: "upgraded", newLevel: toLevel });
  }

  return NextResponse.json({ error: "Офіс вже відкритий. Передайте { upgrade: true } для підвищення рівня." }, { status: 400 });
}
