import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await prisma.user.findUnique({
    where : { id: session.user.id },
    select: { role: true },
  });
  return user?.role === "ADMIN" ? session.user.id : null;
}

// ─── PATCH /api/admin/withdrawals/[id] ───────────────────────────────────────
// Body: { action: "approve" | "reject", note?: string }
//
// approve → status: PROCESSING  (admin confirmed, payout will be sent)
// reject  → status: REJECTED + PC returned to user wallet atomically

type Props = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Props) {
  const adminId = await requireAdmin();
  if (!adminId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json() as { action?: string; note?: string };
  const { action, note } = body;

  if (action !== "approve" && action !== "reject") {
    return NextResponse.json(
      { error: "action must be 'approve' or 'reject'" },
      { status: 400 },
    );
  }

  // Load withdrawal — must be PENDING to act on
  const withdrawal = await prisma.withdrawalRequest.findUnique({
    where  : { id },
    include: { user: { include: { wallet: true } } },
  });

  if (!withdrawal) {
    return NextResponse.json({ error: "Заявку не знайдено" }, { status: 404 });
  }
  if (withdrawal.status !== "PENDING") {
    return NextResponse.json(
      { error: `Заявка вже має статус ${withdrawal.status} і не може бути змінена` },
      { status: 409 },
    );
  }

  try {
    if (action === "approve") {
      // Mark as PROCESSING — funds will be sent externally by admin
      await prisma.withdrawalRequest.update({
        where: { id },
        data : {
          status     : "PROCESSING",
          adminNote  : note ?? null,
          processedBy: adminId,
          processedAt: new Date(),
        },
      });

      return NextResponse.json({
        ok    : true,
        action: "approved",
        status: "PROCESSING",
        note  : note ?? null,
      });
    }

    // action === "reject" — return PC to user wallet atomically
    await prisma.$transaction(async (tx) => {
      // 1. Update withdrawal status
      await tx.withdrawalRequest.update({
        where: { id },
        data : {
          status     : "REJECTED",
          adminNote  : note ?? null,
          processedBy: adminId,
          processedAt: new Date(),
        },
      });

      // 2. Return PC to user wallet
      await tx.userWallet.update({
        where: { userId: withdrawal.userId },
        data : { premiumCoin: { increment: withdrawal.amountPC } },
      });
    }, { timeout: 10_000, isolationLevel: "Serializable" });

    return NextResponse.json({
      ok    : true,
      action: "rejected",
      status: "REJECTED",
      note  : note ?? null,
      refundedPC: Number(withdrawal.amountPC),
    });

  } catch (err) {
    console.error("[admin/withdrawals/patch]", err);
    return NextResponse.json({ error: "Внутрішня помилка сервера" }, { status: 500 });
  }
}

// ─── POST /api/admin/withdrawals/[id] → mark APPROVED (payment confirmed) ────
// Separate action: admin confirms the external payout was completed

export async function POST(req: NextRequest, { params }: Props) {
  const adminId = await requireAdmin();
  if (!adminId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json() as { note?: string };

  const withdrawal = await prisma.withdrawalRequest.findUnique({ where: { id } });
  if (!withdrawal) {
    return NextResponse.json({ error: "Заявку не знайдено" }, { status: 404 });
  }
  if (withdrawal.status !== "PROCESSING") {
    return NextResponse.json(
      { error: "Тільки заявки зі статусом PROCESSING можна підтвердити" },
      { status: 409 },
    );
  }

  await prisma.withdrawalRequest.update({
    where: { id },
    data : {
      status     : "APPROVED",
      adminNote  : body.note ?? withdrawal.adminNote,
      processedBy: adminId,
      processedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true, status: "APPROVED" });
}
