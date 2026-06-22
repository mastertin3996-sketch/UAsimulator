/**
 * FinanceService — corporate finance layer for UAeconomy.
 *
 * Responsibilities:
 *  • generateFinancialReport()   — structured P&L statement for a given period
 *  • applyForCommercialLoan()    — credit scoring + loan issuance with collateral
 *  • processFinancialTick()      — daily loan deductions + insolvency protocol
 *
 * Financial precision:
 *  ALL monetary values use Decimal (decimal.js) throughout — never number.
 *  Tax rates, interest rates, and discount factors are stored as Decimal constants.
 *  Only dimensionless ratios used for comparisons may be converted to number.
 *
 * Ukrainian regulatory context (2026):
 *  CIT (Податок на прибуток):  18%
 *  ESV (роботодавець):         22%
 *  VAT:                        20%
 *  Commercial credit rates:    16–24% p.a. depending on credit rating
 */

import { Prisma, PrismaClient, TransactionType } from '@prisma/client';
import { Decimal }                               from '@prisma/client/runtime/library';
import { AppError }                              from '../errors/AppError';
import { TICKS_PER_MONTH }                       from '../constants/economic';

// ── Monetary constants (Decimal to avoid any float contamination) ─────────────

const ZERO        = new Decimal(0);
const CIT_RATE    = new Decimal('0.18');   // Корпоративний податок на прибуток
const ESV_SHARE   = new Decimal('0.22');   // ЄСВ роботодавця (з суми брутто)
const LIQ_DISC    = new Decimal('0.40');   // Знижка при примусовій ліквідації
const ANNUAL_DEPR = new Decimal('0.20');   // Умовна річна норма амортизації (5 років)

// Debt-service-coverage: deny loan if DSR > 40% of avg net operational CF
const MAX_DEBT_SERVICE_RATIO = new Decimal('0.40');

// Mood drop per tick while player is insolvent
const INSOLVENCY_MOOD_PENALTY = 0.15;

// Consecutive negative-balance ticks before bankruptcy is triggered
const BANKRUPTCY_THRESHOLD_TICKS = 7;

// Interest rate tiers (annual %) indexed by creditRating lower bound
const INTEREST_TIERS: Array<{ minRating: number; rate: Decimal }> = [
  { minRating: 8.0, rate: new Decimal('0.16') },
  { minRating: 6.0, rate: new Decimal('0.18') },
  { minRating: 4.0, rate: new Decimal('0.20') },
  { minRating: 2.0, rate: new Decimal('0.22') },
  { minRating: 0.0, rate: new Decimal('0.24') },
];

// Loan term tiers (months) based on principal
const TERM_TIERS: Array<{ minUah: number; months: number }> = [
  { minUah: 2_000_000, months: 36 },
  { minUah:   500_000, months: 24 },
  { minUah:         0, months: 12 },
];

// ── Public return types ───────────────────────────────────────────────────────

export interface RevenueBreakdown {
  retail:  Decimal;  // NPC_SALE transactions
  b2b:     Decimal;  // MARKET_SALE transactions
  total:   Decimal;
}

export interface OpexBreakdown {
  salaries:    Decimal;  // gross wages (gross = reported SALARY_PAYMENT × 1/1.22)
  esv:         Decimal;  // employer ESV portion
  energy:      Decimal;  // ENERGY_BILL
  logistics:   Decimal;  // FREIGHT_PAYMENT
  lease:       Decimal;  // LAND_LEASE_PAYMENT
  maintenance: Decimal;  // MAINTENANCE_COST
  total:       Decimal;
}

export interface ProfitAndLossStatement {
  playerId:     string;
  period:       'DAY' | 'WEEK' | 'MONTH';
  fromTick:     bigint;
  toTick:       bigint;
  generatedAt:  Date;

  revenue:      RevenueBreakdown;
  opex:         OpexBreakdown;

  /** Revenue − OPEX (before depreciation, interest, taxes) */
  ebitda:          Decimal;
  /** Straight-line equipment depreciation for the period */
  depreciation:    Decimal;
  /** EBITDA − Depreciation */
  ebit:            Decimal;
  /** Accrued interest on all active loans in the period */
  interestExpense: Decimal;
  /** EBIT − Interest */
  ebt:             Decimal;
  /** CIT 18% if EBT > 0, else ₴0 */
  corporateTax:    Decimal;
  /** EBT − CIT */
  netProfit:       Decimal;

  netMarginPct:    number;  // netProfit / revenue.total × 100, 0 if no revenue
  isProfit:        boolean;

  memo: {
    activeLoanCount:            number;
    totalDebtServiceMonthlyUah: Decimal;
    debtServiceRatioPct:        number;
    creditRating:               number;
    insolvencyTickCount:        number;
    isOperationsFrozen:         boolean;
    isBankrupt:                 boolean;
  };
}

export interface LoanApprovalResult {
  approved:           boolean;
  loanId?:            string;
  principalUah?:      Decimal;
  annualInterestPct?: number;
  monthlyPaymentUah?: Decimal;
  dailyPaymentUah?:   Decimal;
  termMonths?:        number;
  rejectionReason?:   string;
  debtServiceRatio?:  number;
}

export interface FinancialTickSummary {
  tick:              bigint;
  loanPaymentsCount: number;
  totalDeductedUah:  Decimal;
  newInsolvencies:   number;
  newBankruptcies:   number;
  recoveries:        number;  // players who came out of negative balance
}

// ═══════════════════════════════════════════════════════════════════════════════

export class FinanceService {
  constructor(private readonly db: PrismaClient) {}

  // ── P&L Report ─────────────────────────────────────────────────────────────

  async generateFinancialReport(
    playerId: string,
    period:   'DAY' | 'WEEK' | 'MONTH',
  ): Promise<ProfitAndLossStatement> {

    const player = await this.db.player.findUniqueOrThrow({
      where:  { id: playerId },
      select: {
        creditRating: true, insolvencyTickCount: true,
        isOperationsFrozen: true, isBankrupt: true,
      },
    });

    // ── Determine tick window ─────────────────────────────────────────────────
    const ticksBack   = period === 'DAY' ? 1 : period === 'WEEK' ? 7 : Number(TICKS_PER_MONTH);
    const { fromTick, toTick, fromDate } = await this.resolveTickWindow(ticksBack);

    // ── Fetch all FinancialTransactions in window ─────────────────────────────
    const txns = await this.db.financialTransaction.findMany({
      where: { playerId, createdAt: { gte: fromDate } },
      select: { type: true, amountUah: true },
    });

    const sumByType = (types: TransactionType[]): Decimal =>
      txns
        .filter(t => types.includes(t.type))
        .reduce((s, t) => s.plus(new Decimal(t.amountUah.toString())), ZERO);

    // Revenue (positive amounts from sale types)
    const retail    = sumByType(['NPC_SALE']).abs();
    const b2b       = sumByType(['MARKET_SALE']).abs();
    const totalRev  = retail.plus(b2b);

    // OPEX (absolute values — stored as negative in DB)
    const salaryTotal  = sumByType(['SALARY_PAYMENT']).abs();
    // SALARY_PAYMENT includes ESV: gross = total / 1.22, esv = total - gross
    const esv          = salaryTotal.times(ESV_SHARE).dividedBy(new Decimal(1).plus(ESV_SHARE));
    const salaries     = salaryTotal.minus(esv);
    const energy       = sumByType(['ENERGY_BILL']).abs();
    const logistics    = sumByType(['FREIGHT_PAYMENT']).abs();
    const lease        = sumByType(['LAND_LEASE_PAYMENT']).abs();
    const maintenance  = sumByType(['MAINTENANCE_COST']).abs();
    const totalOpex    = salaries.plus(esv).plus(energy).plus(logistics).plus(lease).plus(maintenance);

    const ebitda = totalRev.minus(totalOpex);

    // ── Depreciation (straight-line, 20% p.a. of equipment market value) ─────
    const equipment = await this.db.equipment.findMany({
      where:  { workshop: { enterprise: { playerId } } },
      select: { marketValueUah: true },
    });
    const totalEquipmentValue = equipment.reduce(
      (s, eq) => s.plus(new Decimal(eq.marketValueUah.toString())),
      ZERO,
    );
    // Daily depreciation = value × 20% / 365 × number of ticks in period
    const depreciation = totalEquipmentValue
      .times(ANNUAL_DEPR)
      .dividedBy(365)
      .times(ticksBack);

    const ebit = ebitda.minus(depreciation);

    // ── Interest expense (from LoanPayment records in window) ─────────────────
    const loanPayments = await this.db.loanPayment.findMany({
      where: { loan: { playerId }, paidAt: { gte: fromDate } },
      select: { interestUah: true },
    });
    const interestExpense = loanPayments.reduce(
      (s, p) => s.plus(new Decimal(p.interestUah.toString())),
      ZERO,
    );

    const ebt = ebit.minus(interestExpense);

    // CIT 18% — only on positive profit; losses carry forward (not modelled here)
    const corporateTax = ebt.greaterThan(0) ? ebt.times(CIT_RATE) : ZERO;
    const netProfit    = ebt.minus(corporateTax);

    const netMarginPct = totalRev.greaterThan(0)
      ? netProfit.dividedBy(totalRev).times(100).toDecimalPlaces(2).toNumber()
      : 0;

    // ── Active loan summary ───────────────────────────────────────────────────
    const activeLoans = await this.db.loan.findMany({
      where:  { playerId, status: { in: ['ACTIVE', 'OVERDUE'] } },
      select: { monthlyPaymentUah: true },
    });
    const totalDSM = activeLoans.reduce(
      (s, l) => s.plus(new Decimal(l.monthlyPaymentUah.toString())),
      ZERO,
    );
    const avgMonthlyCF = await this.calcAvgNetOperationalCF(playerId, 7);
    const dsRatio = avgMonthlyCF.greaterThan(0)
      ? totalDSM.dividedBy(avgMonthlyCF).times(100).toDecimalPlaces(2).toNumber()
      : 999;

    return {
      playerId,
      period,
      fromTick,
      toTick,
      generatedAt: new Date(),

      revenue:  { retail, b2b, total: totalRev },
      opex:     { salaries, esv, energy, logistics, lease, maintenance, total: totalOpex },
      ebitda,
      depreciation,
      ebit,
      interestExpense,
      ebt,
      corporateTax,
      netProfit,
      netMarginPct,
      isProfit: netProfit.greaterThanOrEqualTo(0),

      memo: {
        activeLoanCount:            activeLoans.length,
        totalDebtServiceMonthlyUah: totalDSM,
        debtServiceRatioPct:        dsRatio,
        creditRating:               player.creditRating,
        insolvencyTickCount:        player.insolvencyTickCount,
        isOperationsFrozen:         player.isOperationsFrozen,
        isBankrupt:                 player.isBankrupt,
      },
    };
  }

  // ── Commercial loan application ────────────────────────────────────────────

  async applyForCommercialLoan(
    playerId:               string,
    amountUah:              number,
    collateralEnterpriseId: string,
  ): Promise<LoanApprovalResult> {

    if (amountUah <= 0) {
      throw new AppError('Loan amount must be positive.', 400, 'INVALID_AMOUNT');
    }

    const principal = new Decimal(amountUah);

    const [player, collateral, activeLoans] = await Promise.all([
      this.db.player.findUniqueOrThrow({ where: { id: playerId } }),
      this.db.enterprise.findUniqueOrThrow({
        where:  { id: collateralEnterpriseId },
        select: { id: true, playerId: true, isOperational: true, isCollateral: true, isSeized: true, name: true },
      }),
      this.db.loan.findMany({
        where:  { playerId, status: { in: ['ACTIVE', 'OVERDUE'] } },
        select: { monthlyPaymentUah: true, remainingUah: true },
      }),
    ]);

    // ── Hard rejections ───────────────────────────────────────────────────────
    if (player.isBankrupt) {
      return { approved: false, rejectionReason: 'Компанія перебуває у стані банкрутства.' };
    }
    if (collateral.playerId !== playerId) {
      return { approved: false, rejectionReason: 'Підприємство-застава не належить гравцю.' };
    }
    if (!collateral.isOperational) {
      return { approved: false, rejectionReason: 'Підприємство-застава не введено в експлуатацію.' };
    }
    if (collateral.isCollateral) {
      return { approved: false, rejectionReason: 'Це підприємство вже є заставою за іншим кредитом.' };
    }
    if (collateral.isSeized) {
      return { approved: false, rejectionReason: 'Підприємство арештовано.' };
    }

    // ── Credit scoring ────────────────────────────────────────────────────────
    const annualRate  = this.getRateForRating(player.creditRating);
    const termMonths  = this.getTermForAmount(amountUah);
    const monthly     = this.calcMonthlyPayment(principal, annualRate, termMonths);
    const daily       = monthly.dividedBy(30).toDecimalPlaces(4);

    // Existing monthly obligations + proposed payment
    const existingDS  = activeLoans.reduce(
      (s, l) => s.plus(new Decimal(l.monthlyPaymentUah.toString())),
      ZERO,
    );
    const totalDS = existingDS.plus(monthly);

    // Average monthly net operational cash flow over last 7 ticks
    const avgMonthlyCF = await this.calcAvgNetOperationalCF(playerId, 7);

    if (avgMonthlyCF.lessThanOrEqualTo(0)) {
      return {
        approved: false,
        rejectionReason:
          `Від'ємний або нульовий операційний грошовий потік: банк не може оцінити платоспроможність.`,
        debtServiceRatio: 999,
      };
    }

    const dsRatio     = totalDS.dividedBy(avgMonthlyCF);
    const dsRatioPct  = dsRatio.times(100).toDecimalPlaces(2).toNumber();

    if (dsRatio.greaterThan(MAX_DEBT_SERVICE_RATIO)) {
      return {
        approved: false,
        rejectionReason:
          `Коефіцієнт боргового навантаження ${dsRatioPct}% перевищує допустимі 40%. ` +
          `Скоротіть існуючі борги або збільшіть операційний грошовий потік.`,
        debtServiceRatio: dsRatioPct,
      };
    }

    // ── Approve and disburse ─────────────────────────────────────────────────
    const lastTick = await this.db.gameTick.findFirst({ orderBy: { tickNumber: 'desc' } });
    const currentTick = lastTick?.tickNumber ?? 0n;

    let loanId!: string;
    await this.db.$transaction(async (tx) => {
      const playerFresh = await tx.player.findUniqueOrThrow({
        where:  { id: playerId },
        select: { cashBalance: true },
      });
      const balanceBefore = new Decimal(playerFresh.cashBalance.toString());
      const balanceAfter  = balanceBefore.plus(principal);

      // Disburse funds
      await tx.player.update({
        where: { id: playerId },
        data:  { cashBalance: balanceAfter },
      });

      // Mark collateral as pledged
      await tx.enterprise.update({
        where: { id: collateralEnterpriseId },
        data:  { isCollateral: true },
      });

      // Create loan record (daily payment frequency for commercial credit)
      const loan = await tx.loan.create({
        data: {
          playerId,
          principalUah:          principal,
          remainingUah:          principal,
          annualInterestPct:     annualRate.times(100).toNumber(),
          monthlyPaymentUah:     monthly,
          dailyPaymentUah:       daily,
          termMonths,
          status:                'ACTIVE',
          nextPaymentTick:       currentTick + 1n,
          paymentFrequencyTicks: 1,
          collateralEnterpriseId,
        },
      });
      loanId = loan.id;

      // Ledger entry
      await tx.financialTransaction.create({
        data: {
          playerId,
          type:          'LOAN_DISBURSEMENT',
          amountUah:     principal,
          balanceBefore,
          balanceAfter,
          description:
            `Комерційний кредит: ₴${principal.toFixed(0)} ` +
            `(застава: ${collateral.name}, ${annualRate.times(100).toFixed(0)}% річних, ${termMonths} міс.)`,
          referenceId:   loan.id,
        },
      });

      // Financial log entry
      await tx.financialLog.create({
        data: {
          playerId,
          category:    'ADJUSTMENT',
          amountUah:   principal,
          description: `Надходження за кредитом ${loan.id.slice(0, 8)}`,
          referenceId: loan.id,
          tickNumber:  currentTick,
        },
      });
    }, { timeout: 15_000 });

    return {
      approved: true,
      loanId,
      principalUah:      principal,
      annualInterestPct: annualRate.times(100).toNumber(),
      monthlyPaymentUah: monthly,
      dailyPaymentUah:   daily,
      termMonths,
      debtServiceRatio:  dsRatioPct,
    };
  }

  // ── Global financial tick ──────────────────────────────────────────────────

  async processFinancialTick(currentTick: bigint): Promise<FinancialTickSummary> {

    const summary: FinancialTickSummary = {
      tick:              currentTick,
      loanPaymentsCount: 0,
      totalDeductedUah:  ZERO,
      newInsolvencies:   0,
      newBankruptcies:   0,
      recoveries:        0,
    };

    // ── Step 1: Daily commercial loan payments ────────────────────────────────
    const dueLoans = await this.db.loan.findMany({
      where: {
        status:               { in: ['ACTIVE', 'OVERDUE'] },
        paymentFrequencyTicks: 1,
        nextPaymentTick:       { lte: currentTick },
      },
      include: { player: { select: { id: true, cashBalance: true, isBankrupt: true } } },
    });

    for (const loan of dueLoans) {
      if (loan.player.isBankrupt) continue;
      const deducted = await this.deductDailyLoanPayment(loan, currentTick);
      if (deducted.greaterThan(0)) {
        summary.loanPaymentsCount++;
        summary.totalDeductedUah = summary.totalDeductedUah.plus(deducted);
      }
    }

    // ── Step 2: Insolvency checks for ALL non-bankrupt players ────────────────
    const players = await this.db.player.findMany({
      where:  { isBankrupt: false },
      select: { id: true, cashBalance: true, insolvencyTickCount: true, isOperationsFrozen: true },
    });

    for (const player of players) {
      const balance = new Decimal(player.cashBalance.toString());

      if (balance.lessThan(0)) {
        const newCount = player.insolvencyTickCount + 1;

        if (newCount >= BANKRUPTCY_THRESHOLD_TICKS) {
          // Bankruptcy threshold reached
          await this.executeBankruptcy(player.id, currentTick);
          summary.newBankruptcies++;
        } else {
          // Freeze operations and apply mood penalty
          await this.db.player.update({
            where: { id: player.id },
            data:  { insolvencyTickCount: newCount, isOperationsFrozen: true },
          });
          await this.freezePlayerOperations(player.id);
          await this.applyInsolvencyMoodPenalty(player.id);
          summary.newInsolvencies++;
        }
      } else if (player.insolvencyTickCount > 0 || player.isOperationsFrozen) {
        // Balance positive again — unfreeze
        await this.db.player.update({
          where: { id: player.id },
          data:  { insolvencyTickCount: 0, isOperationsFrozen: false },
        });
        summary.recoveries++;
      }
    }

    return summary;
  }

  // ── Private: deduct one daily loan payment ─────────────────────────────────

  private async deductDailyLoanPayment(
    loan:        Awaited<ReturnType<typeof this.db.loan.findMany>>[number] & {
                   player: { id: string; cashBalance: Prisma.Decimal; isBankrupt: boolean }
                 },
    currentTick: bigint,
  ): Promise<Decimal> {

    const remaining    = new Decimal(loan.remainingUah.toString());
    const balance      = new Decimal(loan.player.cashBalance.toString());
    const dailyPayment = new Decimal(loan.dailyPaymentUah.toString());

    // Daily interest = remaining balance × daily rate
    const dailyRate      = new Decimal(loan.annualInterestPct).dividedBy(36500); // annual% / 365
    const interestToday  = remaining.times(dailyRate).toDecimalPlaces(4);
    const principalToday = Decimal.max(ZERO, dailyPayment.minus(interestToday));

    // If principal to pay > remaining, this is the final payment
    const actualPrincipal = Decimal.min(principalToday, remaining);
    const totalPayment    = actualPrincipal.plus(interestToday);

    const wasOnTime = balance.greaterThanOrEqualTo(totalPayment);
    const actual    = wasOnTime ? totalPayment : balance; // pay whatever is available

    const newBalance    = balance.minus(actual);
    const newRemaining  = remaining.minus(actualPrincipal);
    const isPaidOff     = newRemaining.lessThanOrEqualTo(0.01);
    const newStatus     = isPaidOff ? 'PAID_OFF'
                        : !wasOnTime ? 'OVERDUE' : 'ACTIVE';

    await this.db.$transaction(async (tx) => {
      await tx.player.update({
        where: { id: loan.playerId },
        data:  { cashBalance: newBalance },
      });

      await tx.loan.update({
        where: { id: loan.id },
        data:  {
          remainingUah:    isPaidOff ? ZERO : newRemaining,
          paidMonths:      { increment: 1 },
          missedPayments:  wasOnTime ? loan.missedPayments : loan.missedPayments + 1,
          status:          newStatus,
          nextPaymentTick: currentTick + 1n,
          fullyPaidAt:     isPaidOff ? new Date() : null,
        },
      });

      await tx.loanPayment.create({
        data: {
          loanId:       loan.id,
          totalUah:     actual,
          principalUah: actualPrincipal,
          interestUah:  interestToday,
          wasOnTime,
        },
      });

      await tx.financialTransaction.create({
        data: {
          playerId:      loan.playerId,
          type:          'LOAN_INTEREST_PAYMENT',
          amountUah:     actual.negated(),
          balanceBefore: balance,
          balanceAfter:  newBalance,
          description:
            `Щоденний платіж за кредитом (залишок ₴${newRemaining.toFixed(0)}): ` +
            `осн. ₴${actualPrincipal.toFixed(2)} + % ₴${interestToday.toFixed(2)}`,
          referenceId:   loan.id,
        },
      });

      // Financial log — split into interest and principal for P&L granularity
      if (interestToday.greaterThan(0)) {
        await tx.financialLog.create({
          data: {
            playerId:    loan.playerId,
            category:    'EXPENSE_INTEREST',
            amountUah:   interestToday.negated(),
            description: `Відсотки за кредитом ${loan.id.slice(0, 8)} (${loan.annualInterestPct}% річних)`,
            referenceId: loan.id,
            tickNumber:  currentTick,
          },
        });
      }
    });

    return actual;
  }

  // ── Private: freeze player operations during insolvency ────────────────────

  private async freezePlayerOperations(playerId: string): Promise<void> {
    await Promise.all([
      // Pause all IN_PROGRESS construction
      this.db.constructionProject.updateMany({
        where: { enterprise: { playerId }, status: 'IN_PROGRESS' },
        data:  { status: 'PLANNED' },  // suspends without cancelling
      }),
      // Cancel all outstanding BUY orders (stop spending)
      this.db.marketOrder.updateMany({
        where: { playerId, type: 'BUY', status: { in: ['OPEN', 'PARTIALLY_FILLED'] } },
        data:  { status: 'CANCELLED' },
      }),
    ]);
  }

  // ── Private: apply mood penalty to all employees during insolvency ──────────

  private async applyInsolvencyMoodPenalty(playerId: string): Promise<void> {
    const employees = await this.db.employee.findMany({
      where:  { playerId },
      select: { id: true, mood: true },
    });

    for (const emp of employees) {
      const newMood = Math.max(0, emp.mood - INSOLVENCY_MOOD_PENALTY);
      await this.db.employee.update({
        where: { id: emp.id },
        data:  {
          mood:      newMood,
          isOnStrike: newMood <= 0.25,
        },
      });
    }
  }

  // ── Private: bankruptcy execution ──────────────────────────────────────────

  private async executeBankruptcy(playerId: string, currentTick: bigint): Promise<void> {
    const collateralLoans = await this.db.loan.findMany({
      where: {
        playerId,
        status:                   { in: ['ACTIVE', 'OVERDUE'] },
        collateralEnterpriseId:   { not: null },
        collateralReleased:       false,
      },
      include: {
        collateral: {
          include: {
            inventory: { include: { product: { select: { baseVolumeLitre: true, baseWeightKg: true } } } },
            workshops: { include: { equipment: { select: { id: true, marketValueUah: true } } } },
          },
        },
      },
    });

    await this.db.$transaction(async (tx) => {
      // Mark player bankrupt
      await tx.player.update({
        where: { id: playerId },
        data:  {
          isBankrupt:          true,
          isOperationsFrozen:  true,
          bankruptcyStartedAt: new Date(),
        },
      });

      // Seize collateral and liquidate assets to repay loans
      for (const loan of collateralLoans) {
        const ent = loan.collateral;
        if (!ent) continue;
        await this.liquidateCollateral(tx, loan.id, loan.remainingUah, loan.playerId, ent, currentTick);
      }

      // Cancel all remaining BUY orders
      await tx.marketOrder.updateMany({
        where: { playerId, type: 'BUY', status: { in: ['OPEN', 'PARTIALLY_FILLED'] } },
        data:  { status: 'CANCELLED' },
      });

      // Cancel all pending deliveries (goods in transit)
      await tx.pendingDelivery.updateMany({
        where:  { playerId, status: 'IN_TRANSIT' },
        data:   { status: 'FAILED' },
      });

      // Log the bankruptcy event
      await tx.financialLog.create({
        data: {
          playerId,
          category:    'ADJUSTMENT',
          amountUah:   ZERO,
          description: `Банкрутство ініційовано. Тік ${currentTick}. Застава(и) вилучено.`,
          tickNumber:  currentTick,
        },
      });
    }, { timeout: 30_000 });
  }

  // ── Private: seize enterprise and liquidate its assets ────────────────────
  //
  // Liquidation value = (inventory market value + equipment value) × (1 − LIQ_DISC).
  // The proceeds are credited first to the outstanding loan; any surplus goes to
  // the player's balance (partial recovery).

  private async liquidateCollateral(
    tx:           Prisma.TransactionClient,
    loanId:       string,
    remainingUah: Prisma.Decimal,
    playerId:     string,
    enterprise: {
      id:        string;
      name:      string;
      inventory: Array<{ id: string; avgQuality: number; quantity: number }>;
      workshops: Array<{ equipment: Array<{ id: string; marketValueUah: Prisma.Decimal }> }>;
    },
    currentTick:  bigint,
  ): Promise<void> {

    let liquidationPool = ZERO;

    // ── Value inventory at (quality/10 × 100 UAH/unit × qty) as market proxy ─
    for (const slot of enterprise.inventory) {
      const unitPrice     = new Decimal(Math.max(slot.avgQuality / 10, 0.1) * 100);
      const grossValue    = unitPrice.times(slot.quantity);
      const netValue      = grossValue.times(new Decimal(1).minus(LIQ_DISC));
      liquidationPool     = liquidationPool.plus(netValue);

      // Clear inventory
      await tx.enterpriseInventory.update({
        where: { id: slot.id },
        data:  { quantity: 0 },
      });
    }

    // ── Value equipment at (marketValueUah × (1 − LIQ_DISC)) ─────────────────
    for (const ws of enterprise.workshops) {
      for (const eq of ws.equipment) {
        const equip = eq as { id: string; marketValueUah: Prisma.Decimal };
        const netValue  = new Decimal(equip.marketValueUah.toString()).times(new Decimal(1).minus(LIQ_DISC));
        liquidationPool = liquidationPool.plus(netValue);
        // Remove equipment
        await tx.equipment.delete({ where: { id: equip.id } });
      }
    }

    // ── Apply proceeds to loan balance ────────────────────────────────────────
    const outstanding  = new Decimal(remainingUah.toString());
    const debtCleared  = Decimal.min(liquidationPool, outstanding);
    const surplus      = liquidationPool.minus(debtCleared);

    await tx.loan.update({
      where: { id: loanId },
      data:  {
        remainingUah:      outstanding.minus(debtCleared),
        collateralReleased: true,
        status:             debtCleared.greaterThanOrEqualTo(outstanding) ? 'PAID_OFF' : 'DEFAULTED',
        fullyPaidAt:        debtCleared.greaterThanOrEqualTo(outstanding) ? new Date() : null,
      },
    });

    // Seize the enterprise
    await tx.enterprise.update({
      where: { id: enterprise.id },
      data:  { isSeized: true, isOperational: false, isCollateral: false },
    });

    // Pause all construction for this enterprise
    await tx.constructionProject.updateMany({
      where: { enterpriseId: enterprise.id, status: 'IN_PROGRESS' },
      data:  { status: 'CANCELLED' },
    });

    // Return surplus (if any) to player
    if (surplus.greaterThan(0.01)) {
      await tx.player.update({
        where: { id: playerId },
        data:  { cashBalance: { increment: surplus } },
      });
    }

    // Financial transactions for audit trail
    await tx.financialTransaction.create({
      data: {
        playerId,
        type:          'BANKRUPTCY_LIQUIDATION',
        amountUah:     liquidationPool.negated(),
        balanceBefore: ZERO,   // balance is already < 0 at this point
        balanceAfter:  surplus.greaterThan(0) ? surplus : ZERO,
        description:
          `Примусова ліквідація: "${enterprise.name}" → ₴${liquidationPool.toFixed(0)} ` +
          `(знижка ${LIQ_DISC.times(100).toFixed(0)}%). ` +
          `Борг погашено на ₴${debtCleared.toFixed(0)}.`,
        referenceId:   loanId,
      },
    });

    await tx.financialLog.create({
      data: {
        playerId,
        category:    'ADJUSTMENT',
        amountUah:   liquidationPool.negated(),
        description: `Ліквідація застави "${enterprise.name}" (${enterprise.id.slice(0, 8)})`,
        referenceId: loanId,
        tickNumber:  currentTick,
      },
    });
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Monthly payment for an amortizing loan.
   * PMT = P × r(1+r)^n / ((1+r)^n − 1)
   * where r = monthly rate (annualRate / 12), n = termMonths.
   */
  private calcMonthlyPayment(
    principal:   Decimal,
    annualRate:  Decimal,
    termMonths:  number,
  ): Decimal {
    const r = annualRate.dividedBy(12);                    // monthly rate
    // (1 + r)^n — uses Decimal.js pow, which handles integer exponents exactly
    const compound = r.plus(1).toDecimalPlaces(20).pow(termMonths);
    // PMT = P × r × (1+r)^n / ((1+r)^n − 1)
    return principal
      .times(r)
      .times(compound)
      .dividedBy(compound.minus(1))
      .toDecimalPlaces(4);
  }

  private getRateForRating(creditRating: number): Decimal {
    for (const tier of INTEREST_TIERS) {
      if (creditRating >= tier.minRating) return tier.rate;
    }
    return INTEREST_TIERS[INTEREST_TIERS.length - 1].rate;
  }

  private getTermForAmount(amountUah: number): number {
    for (const tier of TERM_TIERS) {
      if (amountUah >= tier.minUah) return tier.months;
    }
    return 12;
  }

  /**
   * Average monthly net operational cash flow over the last `ticks` game ticks.
   * Net operational CF = (Revenue from sales) − (OPEX excl. interest & tax).
   * TICKS_PER_MONTH scaling converts from per-tick to per-month.
   */
  private async calcAvgNetOperationalCF(
    playerId:      string,
    ticksLookback: number,
  ): Promise<Decimal> {

    const { fromDate } = await this.resolveTickWindow(ticksLookback);

    const txns = await this.db.financialTransaction.findMany({
      where:  { playerId, createdAt: { gte: fromDate } },
      select: { type: true, amountUah: true },
    });

    const REVENUE_TYPES: TransactionType[] = ['NPC_SALE', 'MARKET_SALE'];
    const OPEX_TYPES:    TransactionType[] = [
      'ENERGY_BILL', 'SALARY_PAYMENT', 'LAND_LEASE_PAYMENT',
      'FREIGHT_PAYMENT', 'MAINTENANCE_COST',
    ];

    const revenue = txns
      .filter(t => REVENUE_TYPES.includes(t.type))
      .reduce((s, t) => s.plus(new Decimal(t.amountUah.toString()).abs()), ZERO);

    const opex = txns
      .filter(t => OPEX_TYPES.includes(t.type))
      .reduce((s, t) => s.plus(new Decimal(t.amountUah.toString()).abs()), ZERO);

    const netCFInPeriod = revenue.minus(opex);

    // Scale to monthly equivalent
    const periodsPerMonth = new Decimal(TICKS_PER_MONTH.toString())
      .dividedBy(ticksLookback);
    return netCFInPeriod.times(periodsPerMonth);
  }

  /** Resolve the start date and tick range for a given lookback window. */
  private async resolveTickWindow(ticksBack: number): Promise<{
    fromTick: bigint;
    toTick:   bigint;
    fromDate: Date;
  }> {
    const recentTicks = await this.db.gameTick.findMany({
      orderBy: { tickNumber: 'desc' },
      take:    ticksBack,
      select:  { tickNumber: true, startedAt: true },
    });

    const toTick   = recentTicks[0]?.tickNumber                              ?? 0n;
    const fromTick = recentTicks[recentTicks.length - 1]?.tickNumber         ?? 0n;
    const fromDate = recentTicks[recentTicks.length - 1]?.startedAt ?? new Date(0);

    return { fromTick, toTick, fromDate };
  }
}
