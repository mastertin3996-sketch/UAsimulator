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

// ─── GET /api/admin/withdrawals ───────────────────────────────────────────────
// Returns withdrawal requests with optional status filter

export async function GET(req: NextRequest) {
  const adminId = await requireAdmin();
  if (!adminId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const status = req.nextUrl.searchParams.get("status") ?? "PENDING";
  const page   = Math.max(1, Number(req.nextUrl.searchParams.get("page") ?? 1));
  const limit  = 20;

  const where = status === "ALL" ? {} : { status: status as never };

  const [total, requests] = await Promise.all([
    prisma.withdrawalRequest.count({ where }),
    prisma.withdrawalRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip   : (page - 1) * limit,
      take   : limit,
      include: {
        user: { select: { id: true, username: true, email: true } },
      },
    }),
  ]);

  return NextResponse.json({
    total,
    page,
    pages: Math.ceil(total / limit),
    requests: requests.map((r) => ({
      id           : r.id,
      userId       : r.userId,
      username     : r.user.username,
      email        : r.user.email,
      amountPC     : Number(r.amountPC),
      amountUSD    : Number(r.amountUSD),
      payoutMethod : r.payoutMethod,
      payoutAddress: r.payoutAddress,  // full address for admin
      status       : r.status,
      adminNote    : r.adminNote,
      processedBy  : r.processedBy,
      createdAt    : r.createdAt,
      processedAt  : r.processedAt,
    })),
  });
}
