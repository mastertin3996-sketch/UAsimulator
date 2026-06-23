import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LoanService } from "@/engine/LoanService";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;
  const body = await req.json().catch(() => ({})) as { amountUah?: number; termMonths?: number };

  if (!body.amountUah || !body.termMonths) {
    return NextResponse.json({ error: "Потрібен amountUah та termMonths" }, { status: 400 });
  }

  const lastTick = await prisma.gameTick.findFirst({ orderBy: { tickNumber: "desc" }, select: { tickNumber: true } });
  const currentTick = lastTick?.tickNumber ?? 1n;

  const svc = new LoanService(prisma);
  try {
    const result = await svc.issueLoan(playerId, body.amountUah, body.termMonths, currentTick);
    return NextResponse.json({
      ok: true,
      loanId: result.loanId,
      monthlyPaymentUah: Number(result.monthlyPaymentUah),
      annualRatePct: result.annualRatePct,
    }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Помилка";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
