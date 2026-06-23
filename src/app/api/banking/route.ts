import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LoanService } from "@/engine/LoanService";
import { BankingLiquidityService } from "@/engine/BankingLiquidityService";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;
  const { searchParams } = new URL(req.url);
  const termMonths = parseInt(searchParams.get("term") ?? "12", 10);

  const loanSvc    = new LoanService(prisma);
  const bankingSvc = new BankingLiquidityService(prisma);

  const [player, loans, deposits, creditOffer, depositRates, lastTick] = await Promise.all([
    prisma.player.findUniqueOrThrow({
      where: { id: playerId },
      select: {
        cashBalance: true, balanceUsd: true, creditRating: true,
        overdraftLimitUah: true, currentOverdraftUsageUah: true,
        netWorth: true,
      },
    }),
    prisma.loan.findMany({
      where: { playerId, status: { in: ["ACTIVE", "OVERDUE"] } },
      select: {
        id: true, principalUah: true, remainingUah: true,
        annualInterestPct: true, monthlyPaymentUah: true,
        termMonths: true, paidMonths: true, missedPayments: true,
        status: true, issuedAt: true, nextPaymentTick: true,
      },
      orderBy: { issuedAt: "desc" },
    }),
    prisma.deposit.findMany({
      where: { playerId },
      select: {
        id: true, currency: true, principalAmount: true,
        annualYieldRate: true, startTick: true, durationTicks: true,
        isMatured: true, finalAmountPaid: true, maturedAtTick: true, createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    loanSvc.getCreditOffer(playerId, termMonths).catch(() => null),
    bankingSvc.getDepositRatesSnapshot().catch(() => null),
    prisma.gameTick.findFirst({ orderBy: { tickNumber: "desc" }, select: { tickNumber: true } }),
  ]);

  const currentTick = lastTick?.tickNumber ?? 0n;

  const activeLoans  = loans.filter(l => l.status === "ACTIVE");
  const overdueLoans = loans.filter(l => l.status === "OVERDUE");
  const totalDebt    = loans.reduce((s, l) => s + Number(l.remainingUah), 0);
  const monthlyBurden = loans.reduce((s, l) => s + Number(l.monthlyPaymentUah), 0);

  const activeDeposits  = deposits.filter(d => !d.isMatured);
  const maturedDeposits = deposits.filter(d => d.isMatured);
  const totalDeposited  = activeDeposits.reduce((s, d) => s + Number(d.principalAmount), 0);

  return NextResponse.json({
    player: {
      cashBalance:             Number(player.cashBalance),
      balanceUsd:              Number(player.balanceUsd),
      creditRating:            player.creditRating,
      netWorth:                Number(player.netWorth),
      overdraftLimitUah:       Number(player.overdraftLimitUah),
      currentOverdraftUsageUah: Number(player.currentOverdraftUsageUah),
    },
    currentTick: Number(currentTick),
    creditOffer: creditOffer ? {
      eligible:                creditOffer.eligible,
      maxAmount:               creditOffer.maxAmount,
      annualRatePct:           creditOffer.annualRatePct,
      monthlyPaymentPerMillion: creditOffer.monthlyPaymentPerMillion,
      reason:                  creditOffer.reason ?? null,
    } : null,
    depositRates: depositRates ? {
      tier:    depositRates.tier,
      uahRate: Number(depositRates.uahRate) * 100,
      usdRate: Number(depositRates.usdRate) * 100,
    } : null,
    summary: {
      activeLoans: activeLoans.length, overdueLoans: overdueLoans.length,
      totalDebt, monthlyBurden,
      activeDeposits: activeDeposits.length, totalDeposited,
    },
    loans: loans.map(l => ({
      ...l,
      principalUah:     Number(l.principalUah),
      remainingUah:     Number(l.remainingUah),
      monthlyPaymentUah: Number(l.monthlyPaymentUah),
      nextPaymentTick:  Number(l.nextPaymentTick),
    })),
    deposits: deposits.map(d => ({
      ...d,
      principalAmount: Number(d.principalAmount),
      annualYieldRate: Number(d.annualYieldRate),
      startTick:       Number(d.startTick),
      durationTicks:   Number(d.durationTicks),
      maturedAtTick:   d.maturedAtTick ? Number(d.maturedAtTick) : null,
      finalAmountPaid: d.finalAmountPaid ? Number(d.finalAmountPaid) : null,
      matureAtTick:    Number(d.startTick) + Number(d.durationTicks),
    })),
  });
}
