import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ── GET /api/admin/security — список алертів ──────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where : { id: session.user.id },
    select: { role: true },
  });
  if (user?.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? undefined;
  const type   = searchParams.get("type")   ?? undefined;

  const [alerts, totalFlagged, recentAudit] = await Promise.all([
    prisma.securityAlert.findMany({
      where  : {
        ...(status ? { status: status as "OPEN" | "REVIEWING" | "RESOLVED" | "DISMISSED" } : {}),
        ...(type   ? { type:   type   as "SUSPICIOUS_TRANSFER" | "MULTI_ACCOUNT"          } : {}),
      },
      orderBy: { createdAt: "desc" },
      take   : 100,
    }),
    prisma.user.count({ where: { isFlagged: true } }),
    prisma.auditLog.findMany({
      where  : { type: { in: ["CONTRACT_EXECUTED", "ENTERPRISE_PURCHASED", "SUSPICIOUS_BLOCKED"] } },
      orderBy: { timestamp: "desc" },
      take   : 50,
    }),
  ]);

  return NextResponse.json({ alerts, totalFlagged, recentAudit });
}

// ── PATCH /api/admin/security — оновити статус алерту ────────────────────────
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where : { id: session.user.id },
    select: { role: true },
  });
  if (user?.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { alertId, status, unflagUsers } = await req.json() as {
    alertId    : string;
    status     : "REVIEWING" | "RESOLVED" | "DISMISSED";
    unflagUsers?: boolean;
  };

  const alert = await prisma.securityAlert.update({
    where: { id: alertId },
    data : {
      status,
      resolvedBy: session.user.id,
      resolvedAt: ["RESOLVED", "DISMISSED"].includes(status) ? new Date() : null,
    },
  });

  // Optionally remove the isFlagged mark when the admin clears the alert
  if (unflagUsers && ["RESOLVED", "DISMISSED"].includes(status)) {
    const ids = [alert.actorId, alert.targetId].filter(Boolean) as string[];
    await prisma.user.updateMany({
      where: { id: { in: ids } },
      data : { isFlagged: false },
    });
  }

  return NextResponse.json({ ok: true, alert });
}
