/**
 * LoanService — кредитна система UAeconomy
 *
 * Банківська модель (реалістичні українські ставки 2026):
 *   Базова ставка НБУ ~14%/рік → комерційні банки +6–10 пп маржі
 *   Діапазон ігрових ставок: 12% (рейтинг 10) … 32% (рейтинг 3)
 *   Формула: annualRate = clamp(0.26 − (rating − 5) × 0.02, 0.12, 0.32)
 *
 * Всі грошові значення (залишки, платежі, відсотки) — Decimal.
 * Відсоткова ставка та рейтинг — number (безрозмірні).
 */

import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

// ─── Константи ───────────────────────────────────────────────────────────────

const BASE_ANNUAL_RATE   = 0.26;
const RATE_PER_POINT     = 0.02;
const MIN_ANNUAL_RATE    = 0.12;
const MAX_ANNUAL_RATE    = 0.32;
const MIN_CREDIT_RATING  = 3.0;
const BASE_LIMIT_PER_PT  = 80_000;
const ABSOLUTE_MAX_LOAN  = 50_000_000;
const MIN_TERM_MONTHS    = 3;
const MAX_TERM_MONTHS    = 60;
const OVERDUE_TICK_GRACE = 3;
const DEFAULT_TICK_LIMIT = 60;

const RATING_DELTA = {
  ON_ISSUE:    -0.10,
  ON_TIME_PAY: +0.08,
  LATE_PAY:    -0.30,
  DEFAULT:     -1.50,
  PAID_OFF:    +0.40,
} as const;

// ─── Tolerances ───────────────────────────────────────────────────────────────
const PAYMENT_TOLERANCE = new Decimal('0.01'); // UAH — менше цього = повністю погашено

// ─────────────────────────────────────────────────────────────────────────────

export class LoanService {
  constructor(private readonly prisma: PrismaClient) {}

  // ── Публічні методи ────────────────────────────────────────────────────────

  /**
   * Розраховує максимальний кредитний ліміт та ставку.
   * Лише читання — не змінює стан БД.
   */
  async getCreditOffer(
    playerId:   string,
    termMonths: number,
  ): Promise<{
    maxAmount:                number;
    annualRatePct:            number;
    monthlyPaymentPerMillion: number;
    eligible:                 boolean;
    reason?:                  string;
  }> {
    const player = await this.prisma.player.findUniqueOrThrow({ where: { id: playerId } });
    const rating = player.creditRating;

    if (rating < MIN_CREDIT_RATING) {
      return {
        maxAmount: 0, annualRatePct: 0, monthlyPaymentPerMillion: 0,
        eligible: false,
        reason: `Кредитний рейтинг ${rating.toFixed(1)} нижчий за мінімальний ${MIN_CREDIT_RATING}`,
      };
    }

    const hasDefault = await this.prisma.loan.findFirst({ where: { playerId, status: 'DEFAULTED' } });
    if (hasDefault) {
      return {
        maxAmount: 0, annualRatePct: 0, monthlyPaymentPerMillion: 0,
        eligible: false, reason: 'Є непогашений дефолт.',
      };
    }

    const annualRate = this.calcAnnualRate(rating);
    const maxAmount  = await this.calcCreditLimit(playerId, rating);
    const term       = clamp(termMonths, MIN_TERM_MONTHS, MAX_TERM_MONTHS);
    const pmt        = annuityPayment(1_000_000, annualRate, term);

    return {
      maxAmount,
      annualRatePct:            annualRate * 100,
      monthlyPaymentPerMillion: pmt.toNumber(),
      eligible: true,
    };
  }

  /**
   * Видає кредит гравцю.
   */
  async issueLoan(
    playerId:    string,
    amountUah:   number, // number від контролера — конвертується у Decimal одразу
    termMonths:  number,
    currentTick: bigint,
  ): Promise<{ loanId: string; monthlyPaymentUah: Decimal; annualRatePct: number }> {
    const player = await this.prisma.player.findUniqueOrThrow({ where: { id: playerId } });
    const rating = player.creditRating;

    if (rating < MIN_CREDIT_RATING) {
      throw new Error(`Кредитний рейтинг ${rating.toFixed(1)} замалий (мінімум ${MIN_CREDIT_RATING})`);
    }

    const hasDefault = await this.prisma.loan.findFirst({ where: { playerId, status: 'DEFAULTED' } });
    if (hasDefault) throw new Error('Наявний дефолт унеможливлює новий кредит');

    const term = clamp(termMonths, MIN_TERM_MONTHS, MAX_TERM_MONTHS);
    if (term !== termMonths) {
      throw new Error(`Строк ${termMonths} міс. поза межами [${MIN_TERM_MONTHS}–${MAX_TERM_MONTHS}]`);
    }

    const maxAmount = await this.calcCreditLimit(playerId, rating);
    if (amountUah > maxAmount) {
      throw new Error(`Запитана сума ${amountUah} UAH перевищує ліміт ${maxAmount.toFixed(0)} UAH`);
    }
    if (amountUah < 10_000) throw new Error('Мінімальна сума кредиту — 10 000 UAH');

    // Конвертуємо у Decimal одразу після валідації
    const amount       = new Decimal(amountUah);
    const annualRate   = this.calcAnnualRate(rating);
    const monthlyPmt   = annuityPayment(amountUah, annualRate, term); // Decimal
    const nextPayTick  = currentTick + BigInt(30);

    // Баланс як Decimal — без Number() конвертації
    const balanceBefore = new Decimal(player.cashBalance.toString());
    const balanceAfter  = balanceBefore.plus(amount);

    const loan = await this.prisma.$transaction(async (tx) => {
      const newLoan = await tx.loan.create({
        data: {
          playerId,
          principalUah:      amount,         // Decimal ✓
          remainingUah:      amount,         // Decimal ✓
          annualInterestPct: annualRate * 100,
          monthlyPaymentUah: monthlyPmt,     // Decimal ✓
          termMonths:        term,
          nextPaymentTick:   nextPayTick,
          status:            'ACTIVE',
        },
      });

      await tx.player.update({
        where: { id: playerId },
        data: {
          cashBalance:  { increment: amount }, // Decimal increment ✓
          creditRating: { increment: RATING_DELTA.ON_ISSUE },
        },
      });

      await tx.financialTransaction.create({
        data: {
          playerId,
          type:          'LOAN_DISBURSEMENT',
          amountUah:      amount,           // Decimal ✓
          balanceBefore,                    // Decimal ✓
          balanceAfter,                     // Decimal ✓
          description:   `Кредит виданий: ${amount.toFixed(2)} UAH на ${term} міс. під ${(annualRate * 100).toFixed(1)}%`,
          referenceId:   newLoan.id,
        },
      });

      return newLoan;
    });

    return {
      loanId:            loan.id,
      monthlyPaymentUah: monthlyPmt,
      annualRatePct:     annualRate * 100,
    };
  }

  /**
   * Обробляє щомісячні платежі.
   * Викликається TickEngine кожні 30 тиків.
   */
  async processMonthlyRepayments(playerId: string, currentTick: bigint): Promise<void> {
    const loans = await this.prisma.loan.findMany({
      where: {
        playerId,
        status:          { in: ['ACTIVE', 'OVERDUE'] },
        nextPaymentTick: { lte: currentTick },
      },
    });

    for (const loan of loans) {
      await this.executeRepayment(loan, currentTick);
    }
  }

  /**
   * Перевіряє всі активні кредити на прострочення.
   * Викликається щотікового циклу.
   */
  async checkOverdueLoans(playerId: string, currentTick: bigint): Promise<void> {
    const overdueLoans = await this.prisma.loan.findMany({
      where: {
        playerId,
        status:          'ACTIVE',
        nextPaymentTick: { lt: currentTick - BigInt(OVERDUE_TICK_GRACE) },
      },
    });

    for (const loan of overdueLoans) {
      const ticksOverdue = Number(currentTick - loan.nextPaymentTick);

      if (ticksOverdue > DEFAULT_TICK_LIMIT) {
        await this.triggerDefault(loan.id, playerId);
      } else {
        const alreadyOverdue = loan.status === 'OVERDUE';
        await this.prisma.loan.update({
          where: { id: loan.id },
          data:  { status: 'OVERDUE' },
        });
        if (!alreadyOverdue) {
          await this.adjustCreditRating(playerId, RATING_DELTA.LATE_PAY);
        }
      }
    }
  }

  /**
   * Дострокове погашення.
   * Штрафу немає (ст. 1049 ЦК України).
   */
  async repayEarly(loanId: string, playerId: string, currentTick: bigint): Promise<void> {
    const loan   = await this.prisma.loan.findUniqueOrThrow({ where: { id: loanId } });
    if (loan.playerId !== playerId) throw new Error('Доступ заборонено');
    if (loan.status === 'PAID_OFF') throw new Error('Кредит вже погашено');

    const remaining = new Decimal(loan.remainingUah.toString());
    const player    = await this.prisma.player.findUniqueOrThrow({ where: { id: playerId } });
    const balance   = new Decimal(player.cashBalance.toString());

    if (balance.lessThan(remaining)) {
      throw new Error(
        `Недостатньо коштів: потрібно ₴${remaining.toFixed(2)}, ` +
        `є ₴${balance.toFixed(2)}`
      );
    }

    const balanceAfter = balance.minus(remaining);

    await this.prisma.$transaction([
      this.prisma.loan.update({
        where: { id: loanId },
        data: {
          remainingUah: new Decimal(0),
          paidMonths:   { increment: 1 },
          status:       'PAID_OFF',
          fullyPaidAt:  new Date(),
        },
      }),
      this.prisma.loanPayment.create({
        data: {
          loanId,
          totalUah:     remaining,          // Decimal ✓
          principalUah: remaining,          // Decimal ✓
          interestUah:  new Decimal(0),     // Decimal ✓
          wasOnTime:    true,
        },
      }),
      this.prisma.player.update({
        where: { id: playerId },
        data: {
          cashBalance:  { decrement: remaining },   // Decimal decrement ✓
          creditRating: clamp(player.creditRating + RATING_DELTA.PAID_OFF, 0, 10),
        },
      }),
      this.prisma.financialTransaction.create({
        data: {
          playerId,
          type:          'LOAN_REPAYMENT',
          amountUah:     remaining.negated(),       // Decimal ✓
          balanceBefore: balance,                   // Decimal ✓
          balanceAfter,                             // Decimal ✓
          description:   `Дострокове погашення кредиту ${loanId.slice(0, 8)}…`,
          referenceId:   loanId,
        },
      }),
    ]);

    await this.adjustCreditRating(playerId, RATING_DELTA.PAID_OFF);
  }

  // ── Приватні методи ────────────────────────────────────────────────────────

  private async executeRepayment(
    loan: {
      id: string; playerId: string;
      remainingUah: { toString(): string };
      annualInterestPct: number;
      monthlyPaymentUah: { toString(): string };
      termMonths: number; paidMonths: number; nextPaymentTick: bigint;
      status: string;
    },
    currentTick: bigint,
  ): Promise<void> {
    const remaining   = new Decimal(loan.remainingUah.toString());
    const monthlyRate = loan.annualInterestPct / 100 / 12; // number — безрозмірний
    const rawPayment  = new Decimal(loan.monthlyPaymentUah.toString());

    // Відсоткова частина: Decimal × number (decimal.js приймає number)
    const interestPart = remaining.times(monthlyRate);

    // Останній платіж: повністю закриваємо залишок
    const isLastPayment  = loan.paidMonths + 1 >= loan.termMonths;
    const totalPayment   = isLastPayment
      ? remaining.plus(interestPart)
      : Decimal.min(rawPayment, remaining.plus(interestPart));

    const principalPart = totalPayment.minus(interestPart);
    const newRemaining  = Decimal.max(new Decimal(0), remaining.minus(principalPart));

    const player      = await this.prisma.player.findUniqueOrThrow({ where: { id: loan.playerId } });
    const balance     = new Decimal(player.cashBalance.toString());
    const canPay      = balance.greaterThanOrEqualTo(totalPayment.minus(PAYMENT_TOLERANCE));
    const wasOnTime   = loan.nextPaymentTick >= currentTick - BigInt(OVERDUE_TICK_GRACE);

    if (!canPay) {
      await this.prisma.loan.update({
        where: { id: loan.id },
        data:  { status: 'OVERDUE', missedPayments: { increment: 1 } },
      });
      await this.adjustCreditRating(loan.playerId, RATING_DELTA.LATE_PAY);
      console.warn(
        `[LoanService] Гравець ${loan.playerId}: недостатньо коштів ` +
        `для платежу ₴${totalPayment.toFixed(2)}, є ₴${balance.toFixed(2)}`
      );
      return;
    }

    const isNowPaidOff = newRemaining.lessThan(PAYMENT_TOLERANCE);
    const nextTick     = isNowPaidOff ? loan.nextPaymentTick : currentTick + BigInt(30);
    const balanceAfter = balance.minus(totalPayment);

    let ratingDelta = wasOnTime ? RATING_DELTA.ON_TIME_PAY : RATING_DELTA.LATE_PAY;
    if (isNowPaidOff) ratingDelta += RATING_DELTA.PAID_OFF;

    await this.prisma.$transaction([
      this.prisma.loan.update({
        where: { id: loan.id },
        data: {
          remainingUah:    newRemaining,          // Decimal ✓
          paidMonths:      { increment: 1 },
          status:          isNowPaidOff ? 'PAID_OFF' : (loan.status === 'OVERDUE' ? 'ACTIVE' : undefined),
          nextPaymentTick: nextTick,
          fullyPaidAt:     isNowPaidOff ? new Date() : undefined,
        },
      }),
      this.prisma.loanPayment.create({
        data: {
          loanId:       loan.id,
          totalUah:     totalPayment,             // Decimal ✓
          principalUah: principalPart,            // Decimal ✓
          interestUah:  interestPart,             // Decimal ✓
          wasOnTime,
        },
      }),
      this.prisma.player.update({
        where: { id: loan.playerId },
        data: {
          cashBalance:  { decrement: totalPayment },  // Decimal ✓
          creditRating: clamp(player.creditRating + ratingDelta, 0, 10),
        },
      }),
      this.prisma.financialTransaction.create({
        data: {
          playerId:      loan.playerId,
          type:          'LOAN_REPAYMENT',
          amountUah:     totalPayment.negated(),       // Decimal ✓
          balanceBefore: balance,                      // Decimal ✓
          balanceAfter,                                // Decimal ✓
          description:
            `Кредит ${loan.id.slice(0, 8)}… | ` +
            `тіло: ₴${principalPart.toFixed(2)} + % ₴${interestPart.toFixed(2)}` +
            (isNowPaidOff ? ' | ПОГАШЕНО' : ''),
          referenceId: loan.id,
        },
      }),
    ]);
  }

  private async triggerDefault(loanId: string, playerId: string): Promise<void> {
    await this.prisma.loan.update({
      where: { id: loanId },
      data:  { status: 'DEFAULTED' },
    });
    await this.adjustCreditRating(playerId, RATING_DELTA.DEFAULT);
    console.error(`[LoanService] ДЕФОЛТ: гравець ${playerId}, кредит ${loanId}`);
  }

  private async adjustCreditRating(playerId: string, delta: number): Promise<void> {
    const player = await this.prisma.player.findUniqueOrThrow({ where: { id: playerId } });
    await this.prisma.player.update({
      where: { id: playerId },
      data:  { creditRating: clamp(player.creditRating + delta, 0, 10) },
    });
  }

  private calcAnnualRate(creditRating: number): number {
    return clamp(
      BASE_ANNUAL_RATE - (creditRating - 5) * RATE_PER_POINT,
      MIN_ANNUAL_RATE,
      MAX_ANNUAL_RATE,
    );
  }

  private async calcCreditLimit(playerId: string, rating: number): Promise<number> {
    const baseLimit = rating * BASE_LIMIT_PER_PT;

    const [plots, enterprises] = await Promise.all([
      this.prisma.landPlot.findMany({ where: { playerId, status: { in: ['OWNED', 'LEASED'] } } }),
      this.prisma.enterprise.findMany({ where: { playerId, isOperational: true } }),
    ]);

    // purchasePriceUah — Decimal; підсумовуємо через Decimal, потім конвертуємо у number
    // для повернення у number-API ліміту (UI відображення, не фін. розрахунок)
    const landValue = plots.reduce(
      (s, p) => s.plus(new Decimal(p.purchasePriceUah.toString())),
      new Decimal(0),
    ).toNumber();

    const enterpriseValue = enterprises.length * 200_000;
    const assetBonus      = landValue * 0.35 + enterpriseValue * 0.20;

    const activeLoans = await this.prisma.loan.findMany({
      where: { playerId, status: { in: ['ACTIVE', 'OVERDUE'] } },
    });
    const totalDebt = activeLoans.reduce(
      (s, l) => s.plus(new Decimal(l.remainingUah.toString())),
      new Decimal(0),
    ).toNumber();

    return clamp(baseLimit + assetBonus - totalDebt, 0, ABSOLUTE_MAX_LOAN);
  }
}

// ─── PMT — ануїтетний платіж ─────────────────────────────────────────────────
// Math.pow з числами — допустимо, бо r і n — безрозмірні.
// Результат округлюємо до 4 знаків і повертаємо Decimal.
function annuityPayment(principal: number, annualRate: number, termMonths: number): Decimal {
  const r = annualRate / 12;
  if (r === 0) return new Decimal(principal).dividedBy(termMonths).toDecimalPlaces(4);
  const factor = Math.pow(1 + r, termMonths);
  const pmt    = (principal * r * factor) / (factor - 1);
  return new Decimal(pmt.toFixed(4));
}

// ─── Utility (non-monetary) ───────────────────────────────────────────────────
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
