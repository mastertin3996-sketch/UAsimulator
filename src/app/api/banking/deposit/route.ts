import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BankingLiquidityService } from "@/engine/BankingLiquidityService";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;
  const body = await req.json().catch(() => ({})) as {
    amount?: number;
    currency?: "UAH" | "USD";
    durationDays?: number;
  };

  if (!body.amount || !body.currency || !body.durationDays) {
    return NextResponse.json({ error: "Потрібен amount, currency (UAH|USD), durationDays" }, { status: 400 });
  }

  if (!["UAH", "USD"].includes(body.currency)) {
    return NextResponse.json({ error: "currency має бути UAH або USD" }, { status: 400 });
  }

  const lastTick = await prisma.gameTick.findFirst({ orderBy: { tickNumber: "desc" }, select: { tickNumber: true } });
  const currentTick = lastTick?.tickNumber ?? 1n;

  const svc = new BankingLiquidityService(prisma);
  try {
    const result = await svc.openCorporateDeposit(playerId, body.currency, body.amount, body.durationDays, currentTick);
    return NextResponse.json({
      ok: true,
      depositId:       result.depositId,
      principalAmount: Number(result.principalAmount),
      annualYieldRate: Number(result.annualYieldRate) * 100,
      durationTicks:   Number(result.durationTicks),
      matureAtTick:    Number(result.matureAtTick),
    }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Помилка";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
