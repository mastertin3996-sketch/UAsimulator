/**
 * POST /api/agro/loan
 * Аграрний кредит (AGRO_LOAN) — 8% річних.
 * Потребує активного GrainForwardContract як заставу.
 * Body: { forwardContractId, principalUah, termMonths }
 *
 * GET /api/agro/loan
 * Повертає активні агро-кредити гравця.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";

const AGRO_INTEREST_PCT = 8.0;  // 8% річних
const MAX_LOAN_TO_CONTRACT_RATIO = 0.70; // макс 70% від вартості контракту

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const loans = await prisma.loan.findMany({
    where:   { playerId: session.user.id, loanType: "AGRO_LOAN", status: "ACTIVE" },
    orderBy: { issuedAt: "desc" },
    take: 20,
    select: {
      id: true, principalUah: true, remainingUah: true,
      annualInterestPct: true, monthlyPaymentUah: true,
      termMonths: true, paidMonths: true, missedPayments: true,
      status: true, issuedAt: true, nextPaymentTick: true,
      collateralForwardContractId: true,
    },
  });

  return NextResponse.json({
    loans: loans.map(l => ({
      ...l,
      principalUah:      Number(l.principalUah),
      remainingUah:      Number(l.remainingUah),
      monthlyPaymentUah: Number(l.monthlyPaymentUah),
      nextPaymentTick:   l.nextPaymentTick.toString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { forwardContractId, principalUah, termMonths } = body as {
    forwardContractId: string;
    principalUah: number;
    termMonths: number;
  };

  if (!forwardContractId || !principalUah || !termMonths) {
    return NextResponse.json({ error: "forwardContractId, principalUah, termMonths required" }, { status: 400 });
  }
  if (principalUah < 1000) {
    return NextResponse.json({ error: "Мінімальна сума кредиту: ₴1 000" }, { status: 400 });
  }
  if (termMonths < 1 || termMonths > 24) {
    return NextResponse.json({ error: "Термін: від 1 до 24 місяців" }, { status: 400 });
  }

  // Check forward contract belongs to player and is ACTIVE
  const contract = await prisma.grainForwardContract.findFirst({
    where:  { id: forwardContractId, playerId: session.user.id, status: "ACTIVE" },
    select: { id: true, quantityUnits: true, pricePerUnit: true, deliveryTick: true },
  });
  if (!contract) {
    return NextResponse.json({ error: "Активний ф'ючерсний контракт не знайдено" }, { status: 404 });
  }

  // Check existing agro loan is not already using this contract as collateral
  const existingLoan = await prisma.loan.findFirst({
    where: { collateralForwardContractId: forwardContractId, status: "ACTIVE" },
  });
  if (existingLoan) {
    return NextResponse.json({ error: "Цей контракт вже використовується як застава" }, { status: 409 });
  }

  // Validate principal vs collateral value
  const contractValue = contract.quantityUnits * Number(contract.pricePerUnit);
  const maxLoan = Math.round(contractValue * MAX_LOAN_TO_CONTRACT_RATIO);
  if (principalUah > maxLoan) {
    return NextResponse.json({
      error: `Максимальна сума кредиту: ₴${maxLoan.toLocaleString()} (70% від вартості контракту ₴${Math.round(contractValue).toLocaleString()})`,
    }, { status: 400 });
  }

  // Compute monthly payment: P × (r(1+r)^n) / ((1+r)^n − 1), r = annual/12/100
  const r = AGRO_INTEREST_PCT / 12 / 100;
  const n = termMonths;
  const monthlyPayment = r > 0
    ? Math.round(principalUah * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1))
    : Math.round(principalUah / n);

  const currentTick = await prisma.gameTick.findFirst({
    orderBy: { tickNumber: "desc" },
    select:  { tickNumber: true },
  });
  const tick = BigInt(currentTick?.tickNumber ?? 0);
  const nextPaymentTick = tick + 30n; // перший платіж через 30 тіків

  const player = await prisma.player.findUnique({
    where: { id: session.user.id }, select: { cashBalance: true },
  });
  const balanceBefore = new Decimal(player!.cashBalance.toString());
  const balanceAfter  = balanceBefore.plus(principalUah);

  await prisma.$transaction([
    prisma.loan.create({
      data: {
        playerId:                    session.user.id,
        loanType:                    "AGRO_LOAN",
        principalUah:                new Decimal(principalUah),
        remainingUah:                new Decimal(principalUah),
        annualInterestPct:           AGRO_INTEREST_PCT,
        monthlyPaymentUah:           new Decimal(monthlyPayment),
        dailyPaymentUah:             new Decimal(0),
        termMonths,
        nextPaymentTick,
        collateralForwardContractId: forwardContractId,
        paymentFrequencyTicks:       30,
      },
    }),
    prisma.player.update({
      where: { id: session.user.id },
      data:  { cashBalance: { increment: principalUah } },
    }),
    prisma.financialTransaction.create({
      data: {
        playerId:    session.user.id,
        type:        "LOAN_DISBURSEMENT",
        amountUah:   new Decimal(principalUah),
        balanceBefore,
        balanceAfter,
        description: `Аграрний кредит 8% на ${termMonths} міс. Застава: ф'ючерс #${forwardContractId.slice(0, 8)}`,
      },
    }),
  ]);

  return NextResponse.json({
    message:       `Аграрний кредит ₴${principalUah.toLocaleString()} видано. Щомісячний платіж: ₴${monthlyPayment.toLocaleString()}.`,
    principalUah,
    monthlyPayment,
    termMonths,
    annualInterestPct: AGRO_INTEREST_PCT,
    contractValue: Math.round(contractValue),
    maxLoan,
  }, { status: 201 });
}
