import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BankingLiquidityService } from "@/engine/BankingLiquidityService";

const settleOverdraftSchema = z.object({
  amountUah: z.number().finite().positive(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;

  const rawBody = await req.json().catch(() => null);
  const parsed  = settleOverdraftSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Потрібен amountUah > 0" }, { status: 400 });
  }
  const body = parsed.data;

  const lastTick = await prisma.gameTick.findFirst({ orderBy: { tickNumber: "desc" }, select: { tickNumber: true } });
  const currentTick = lastTick?.tickNumber ?? 1n;

  const svc = new BankingLiquidityService(prisma);
  try {
    const result = await svc.settleOverdraft(playerId, body.amountUah, currentTick);
    return NextResponse.json({
      ok: true,
      settledUah:        Number(result.settledUah),
      remainingUsageUah: Number(result.remainingUsageUah),
      newCashBalance:    Number(result.newCashBalance),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Помилка";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
