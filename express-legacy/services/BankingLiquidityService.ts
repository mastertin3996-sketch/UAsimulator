/**
 * BankingLiquidityService — корпоративні депозити, динамічні ставки та овердрафт.
 *
 * ── Динамічні ставки (calculateDynamicDepositRates) ───────────────────────────
 *
 *   Базуються на «ефективній ліквідності» держбюджету:
 *     effectiveLiquidity = StateBudget.(totalTaxRevenue + customsRevenueUah
 *                                       − allocatedSubsidiesTotal)
 *
 *   Тіри (UAH / USD):
 *     HIGH  ≥ ₴500M →  12% / 3.0%   (високий попит, низька монетарна напруга)
 *     MID   ≥ ₴100M →  15% / 4.5%
 *     LOW   ≥ ₴10M  →  18% / 5.5%
 *     CRIT  < ₴10M  →  21% / 6.0%   (виснаження бюджету / монетарна контракція)
 *
 * ── Складний відсоток (openCorporateDeposit / processBankingTick) ─────────────
 *
 *   Формула: finalAmount = principal × (1 + annualRate / 365) ^ durationTicks
 *
 *   де annualRate зберігається у форматі 0.15 (15%), durationTicks = кількість
 *   ігрових днів (1 тік = 1 день). Ставка фіксується при відкритті депозиту.
 *
 * ── Овердрафт (processBankingTick) ───────────────────────────────────────────
 *
 *   Овердрафт — кредитна лінія у UAH. Тригерується автоматично при виявленні
 *   від'ємного балансу гравця після виконання всіх платіжних операцій тіку.
 *
 *   Поточна заборгованість (currentOverdraftUsageUah) зростає:
 *     1. При drawdown: += |cashBalance| якщо cashBalance < 0
 *     2. При капіталізації відсотків: += usage × (0.36 / 365) щодня
 *
 *   Якщо після капіталізації currentOverdraftUsageUah > overdraftLimitUah →
 *   перевищення ліміту; залишок списується з cashBalance, що запускає штатний
 *   InsolvencyProtocol через накопичення insolvencyTickCount.
 *
 *   Погашення: settleOverdraft(playerId, amountUah) — ручний або автоматичний
 *   виклик з API; зменшує currentOverdraftUsageUah, списує з cashBalance.
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

// ── Бюджетні порогові значення для визначення тіру ────────────────────────────
const BUDGET_TIER_HIGH_UAH = new Decimal('500000000');   // ₴500М
const BUDGET_TIER_MID_UAH  = new Decimal('100000000');   // ₴100М
const BUDGET_TIER_LOW_UAH  = new Decimal('10000000');    // ₴10М

// Ставки депозитів за тирами
const DEPOSIT_RATES = {
  UAH: { HIGH: 0.12, MID: 0.15, LOW: 0.18, CRIT: 0.21 },
  USD: { HIGH: 0.030, MID: 0.045, LOW: 0.055, CRIT: 0.06 },
} as const;

// Овердрафт: 36% річних, нараховується щоденно
const OVERDRAFT_ANNUAL_RATE  = new Decimal('0.36');
const DAYS_PER_YEAR          = new Decimal('365');
const OVERDRAFT_DAILY_RATE   = OVERDRAFT_ANNUAL_RATE.dividedBy(DAYS_PER_YEAR);

// Мінімальна тривалість депозиту: 7 ігрових днів
const MIN_DEPOSIT_DURATION_TICKS = 7n;

// Ідентифікатори синглтонів
const STATE_BUDGET_ID = 'fiscal-budget-singleton';

// ── Типи результатів ──────────────────────────────────────────────────────────

export interface DepositRates {
  tier:      'HIGH' | 'MID' | 'LOW' | 'CRIT';
  uahRate:   Decimal;
  usdRate:   Decimal;
  liquidity: Decimal;   // effectiveLiquidity, для UI
}

export interface DepositOpenResult {
  depositId:       string;
  currency:        'UAH' | 'USD';
  principalAmount: Decimal;
  annualYieldRate: Decimal;
  durationTicks:   bigint;
  matureAtTick:    bigint;
}

export interface BankingTickSummary {
  tick:                bigint;
  depositsMatured:     number;
  interestPaidUah:     Decimal;
  interestPaidUsd:     Decimal;
  overdraftDrawdowns:  number;
  overdraftDrawnUah:   Decimal;
  overdraftInterestUah: Decimal;
  limitBreachPlayers:  string[];   // playerId-и, що перевищили ліміт
}

export interface OverdraftSettlementResult {
  playerId:           string;
  settledUah:         Decimal;
  remainingUsageUah:  Decimal;
  newCashBalance:     Decimal;
}

// ═════════════════════════════════════════════════════════════════════════════

export class BankingLiquidityService {
  constructor(private readonly db: PrismaClient) {}

  // ══════════════════════════════════════════════════════════════════════════
  // ДИНАМІЧНІ СТАВКИ
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Обчислює поточні ставки корпоративних депозитів на основі ефективної
   * ліквідності держбюджету.
   *
   * effectiveLiquidity = totalTaxRevenue + customsRevenueUah − allocatedSubsidiesTotal
   *
   * Чим вищий залишок — тим нижчі ставки (монетарна експансія);
   * чим нижчий — тим вищі (монетарна контракція, ризик-преміум).
   */
  async calculateDynamicDepositRates(currency: 'UAH' | 'USD'): Promise<Decimal> {
    const budget = await this.db.stateBudget.findUnique({
      where:  { id: STATE_BUDGET_ID },
      select: {
        totalTaxRevenue:      true,
        customsRevenueUah:    true,
        allocatedSubsidiesTotal: true,
      },
    });

    const liquidity = budget
      ? new Decimal(budget.totalTaxRevenue.toString())
          .plus(budget.customsRevenueUah.toString())
          .minus(budget.allocatedSubsidiesTotal.toString())
      : new Decimal(0);

    const tier = this.resolveRateTier(liquidity);
    return new Decimal(DEPOSIT_RATES[currency][tier].toString());
  }

  /**
   * Повертає повний snapshot: тир + обидві ставки + сама ліквідність.
   * Використовується у API для відображення в банківській панелі.
   */
  async getDepositRatesSnapshot(): Promise<DepositRates> {
    const budget = await this.db.stateBudget.findUnique({
      where:  { id: STATE_BUDGET_ID },
      select: {
        totalTaxRevenue:         true,
        customsRevenueUah:       true,
        allocatedSubsidiesTotal: true,
      },
    });

    const liquidity = budget
      ? new Decimal(budget.totalTaxRevenue.toString())
          .plus(budget.customsRevenueUah.toString())
          .minus(budget.allocatedSubsidiesTotal.toString())
      : new Decimal(0);

    const tier = this.resolveRateTier(liquidity);
    return {
      tier,
      uahRate:   new Decimal(DEPOSIT_RATES.UAH[tier].toString()),
      usdRate:   new Decimal(DEPOSIT_RATES.USD[tier].toString()),
      liquidity,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ВІДКРИТТЯ ДЕПОЗИТУ
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Розміщує корпоративний депозит.
   *
   * Строга транзакція:
   *   1. Читає та перевіряє баланс гравця у відповідній валюті.
   *   2. Фіксує поточну ставку (не змінюється впродовж строку).
   *   3. Списує principal з рахунку та створює Deposit-запис.
   *   4. Записує FinancialTransaction (DEPOSIT_OPEN).
   *
   * @param durationDays — тривалість у ігрових днях (1 тік = 1 день)
   */
  async openCorporateDeposit(
    playerId:     string,
    currency:     'UAH' | 'USD',
    amount:       number,
    durationDays: number,
    currentTick:  bigint,
  ): Promise<DepositOpenResult> {
    if (amount <= 0) throw new Error('Сума депозиту повинна бути більша за 0.');
    const durationTicks = BigInt(Math.round(durationDays));
    if (durationTicks < MIN_DEPOSIT_DURATION_TICKS) {
      throw new Error(`Мінімальна тривалість депозиту — ${MIN_DEPOSIT_DURATION_TICKS} днів.`);
    }

    const principal = new Decimal(amount.toFixed(currency === 'UAH' ? 2 : 4));

    return this.db.$transaction(async tx => {
      // ── 1. Перевірка та фіксація ставки ─────────────────────────────────
      const player = await tx.player.findUniqueOrThrow({
        where:  { id: playerId },
        select: { cashBalance: true, balanceUsd: true },
      });

      const currentBalance = currency === 'UAH'
        ? new Decimal(player.cashBalance.toString())
        : new Decimal(player.balanceUsd.toString());

      if (currentBalance.lessThan(principal)) {
        throw new Error(
          `Недостатньо коштів у ${currency}: ` +
          `потрібно ${principal.toFixed(4)}, є ${currentBalance.toFixed(4)}.`,
        );
      }

      // Фіксуємо ставку на момент відкриття
      const annualYieldRate = await this.calculateDynamicDepositRates(currency);
      const newBalance      = currentBalance.minus(principal);

      // ── 2. Списання principal з рахунку ─────────────────────────────────
      await tx.player.update({
        where: { id: playerId },
        data: currency === 'UAH'
          ? { cashBalance: newBalance }
          : { balanceUsd: newBalance },
      });

      // ── 3. Створення Deposit-запису ──────────────────────────────────────
      const deposit = await tx.deposit.create({
        data: {
          playerId,
          currency,
          principalAmount: principal,
          annualYieldRate,
          startTick:     currentTick,
          durationTicks,
          isMatured:     false,
        },
      });

      // ── 4. FinancialTransaction (лише для UAH — USD не веде UAH-ledger) ─
      if (currency === 'UAH') {
        const balanceBefore = currentBalance;
        await tx.financialTransaction.create({
          data: {
            playerId,
            type:          'DEPOSIT_OPEN',
            amountUah:     principal.negated(),
            balanceBefore,
            balanceAfter:  newBalance,
            description:   `Депозит ${annualYieldRate.times(100).toFixed(2)}% р./р. на ${durationDays} днів`,
            referenceId:   deposit.id,
          },
        });
      }

      return {
        depositId:       deposit.id,
        currency,
        principalAmount: principal,
        annualYieldRate,
        durationTicks,
        matureAtTick:    currentTick + durationTicks,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ГЛОБАЛЬНИЙ ТІКОВИЙ ПРОЦЕСОР
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Виконується кожен тік у TickEngine (крок 3k — після всіх billing-сервісів).
   *
   * Порядок операцій:
   *   A. Погашення дозрілих депозитів
   *      → поверненю principal + нараховані складні відсотки
   *   B. Покриття від'ємних залишків через овердрафт (drawdown)
   *   C. Капіталізація відсотків на діючий овердрафт (36% р./р. / 365)
   *      → якщо після капіталізації usage > limit → перевищення ліміту
   */
  async processBankingTick(currentTick: bigint): Promise<BankingTickSummary> {
    const summary: BankingTickSummary = {
      tick:                 currentTick,
      depositsMatured:      0,
      interestPaidUah:      new Decimal(0),
      interestPaidUsd:      new Decimal(0),
      overdraftDrawdowns:   0,
      overdraftDrawnUah:    new Decimal(0),
      overdraftInterestUah: new Decimal(0),
      limitBreachPlayers:   [],
    };

    // ── A. Погашення дозрілих депозитів ─────────────────────────────────────
    const matureDeposits = await this.db.deposit.findMany({
      where: {
        isMatured:  false,
        // startTick + durationTicks <= currentTick
        // Prisma не підтримує Decimal арифметику у where → сирий SQL
      },
    });

    for (const dep of matureDeposits) {
      const matureAtTick = dep.startTick + dep.durationTicks;
      if (matureAtTick > currentTick) continue;

      await this.matureDeposit(dep.id, currentTick, summary);
    }

    // ── B. Drawdown: покриваємо від'ємні залишки овердрафтом ────────────────
    const playersNegative = await this.db.player.findMany({
      where: {
        cashBalance:      { lt: 0 },
        overdraftLimitUah: { gt: 0 },
        isBankrupt:       false,
      },
      select: {
        id:                       true,
        cashBalance:              true,
        overdraftLimitUah:        true,
        currentOverdraftUsageUah: true,
      },
    });

    for (const player of playersNegative) {
      await this.applyOverdraftDrawdown(player, currentTick, summary);
    }

    // ── C. Капіталізація відсотків на діючий овердрафт ──────────────────────
    const playersWithOverdraft = await this.db.player.findMany({
      where: {
        currentOverdraftUsageUah: { gt: 0 },
        isBankrupt:               false,
      },
      select: {
        id:                       true,
        cashBalance:              true,
        overdraftLimitUah:        true,
        currentOverdraftUsageUah: true,
      },
    });

    for (const player of playersWithOverdraft) {
      await this.capitalizeOverdraftInterest(player, currentTick, summary);
    }

    return summary;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // РУЧНЕ ПОГАШЕННЯ ОВЕРДРАФТУ
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Гравець (або API) гасить частину або весь борг за овердрафтом.
   * Кошти списуються з cashBalance і зменшують currentOverdraftUsageUah.
   */
  async settleOverdraft(
    playerId:  string,
    amountUah: number,
    currentTick: bigint,
  ): Promise<OverdraftSettlementResult> {
    const settle = new Decimal(amountUah.toFixed(2));
    if (settle.lte(0)) throw new Error('Сума погашення повинна бути більша за 0.');

    return this.db.$transaction(async tx => {
      const player = await tx.player.findUniqueOrThrow({
        where:  { id: playerId },
        select: {
          cashBalance:              true,
          currentOverdraftUsageUah: true,
          overdraftLimitUah:        true,
        },
      });

      const usage      = new Decimal(player.currentOverdraftUsageUah.toString());
      const balance    = new Decimal(player.cashBalance.toString());
      const actualSettle = Decimal.min(settle, usage, balance.gt(0) ? balance : new Decimal(0));

      if (actualSettle.lte(0)) {
        throw new Error(
          'Неможливо погасити: недостатньо коштів або немає заборгованості.',
        );
      }

      const newBalance = balance.minus(actualSettle);
      const newUsage   = usage.minus(actualSettle);

      await tx.player.update({
        where: { id: playerId },
        data: {
          cashBalance:              newBalance,
          currentOverdraftUsageUah: newUsage,
        },
      });

      await tx.financialTransaction.create({
        data: {
          playerId,
          type:          'LOAN_REPAYMENT',   // семантично найближчий тип
          amountUah:     actualSettle.negated(),
          balanceBefore: balance,
          balanceAfter:  newBalance,
          description:   `Погашення овердрафту ₴${actualSettle.toFixed(0)} (залишок: ₴${newUsage.toFixed(0)})`,
        },
      });

      return {
        playerId,
        settledUah:        actualSettle,
        remainingUsageUah: newUsage,
        newCashBalance:    newBalance,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }

  /**
   * Встановлює або змінює ліміт овердрафту для гравця (виклик від банківського API).
   * Зменшення ліміту нижче поточного боргу не дозволяється.
   */
  async setOverdraftLimit(playerId: string, limitUah: number): Promise<void> {
    const newLimit = new Decimal(limitUah.toFixed(2));
    if (newLimit.lt(0)) throw new Error('Ліміт не може бути від\'ємним.');

    const player = await this.db.player.findUniqueOrThrow({
      where:  { id: playerId },
      select: { currentOverdraftUsageUah: true },
    });

    const usage = new Decimal(player.currentOverdraftUsageUah.toString());
    if (newLimit.lt(usage)) {
      throw new Error(
        `Новий ліміт ₴${newLimit.toFixed(0)} менший за поточний борг ₴${usage.toFixed(0)}. ` +
        'Спочатку погасіть частину заборгованості.',
      );
    }

    await this.db.player.update({
      where: { id: playerId },
      data:  { overdraftLimitUah: newLimit },
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ПРИВАТНЕ — ПОГАШЕННЯ ДЕПОЗИТУ
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Розраховує та виплачує дозрілий депозит.
   *
   * Формула складного відсотка (нараховується щоденно):
   *   finalAmount = principal × (1 + annualRate / 365) ^ durationTicks
   *   interest    = finalAmount − principal
   */
  private async matureDeposit(
    depositId:   string,
    currentTick: bigint,
    summary:     BankingTickSummary,
  ): Promise<void> {
    await this.db.$transaction(async tx => {
      const dep = await tx.deposit.findUniqueOrThrow({
        where:  { id: depositId },
        select: {
          id:              true,
          playerId:        true,
          currency:        true,
          principalAmount: true,
          annualYieldRate: true,
          durationTicks:   true,
          isMatured:       true,
        },
      });

      // Guard: може бути вже погашений у паралельному виклику
      if (dep.isMatured) return;

      const principal     = new Decimal(dep.principalAmount.toString());
      const annualRate    = new Decimal(dep.annualYieldRate.toString());

      // dailyRate = annualRate / 365
      const dailyRate     = annualRate.dividedBy(DAYS_PER_YEAR);
      // compound factor = (1 + dailyRate) ^ durationTicks
      const factor        = new Decimal(1).plus(dailyRate).pow(Number(dep.durationTicks));
      const finalAmount   = principal.times(factor);
      const interest      = finalAmount.minus(principal);

      // Читаємо поточний баланс гравця
      const player = await tx.player.findUniqueOrThrow({
        where:  { id: dep.playerId },
        select: { cashBalance: true, balanceUsd: true },
      });

      const balanceBefore = dep.currency === 'UAH'
        ? new Decimal(player.cashBalance.toString())
        : new Decimal(player.balanceUsd.toString());
      const balanceAfter  = balanceBefore.plus(finalAmount);

      // Зараховуємо finalAmount на відповідний рахунок
      await tx.player.update({
        where: { id: dep.playerId },
        data: dep.currency === 'UAH'
          ? { cashBalance: balanceAfter }
          : { balanceUsd: balanceAfter },
      });

      // Позначаємо депозит як погашений
      await tx.deposit.update({
        where: { id: depositId },
        data: {
          isMatured:      true,
          finalAmountPaid: finalAmount,
          maturedAtTick:  currentTick,
        },
      });

      // FinancialTransaction — повернення тіла депозиту
      if (dep.currency === 'UAH') {
        await tx.financialTransaction.create({
          data: {
            playerId:      dep.playerId,
            type:          'DEPOSIT_MATURITY',
            amountUah:     principal,
            balanceBefore,
            balanceAfter:  balanceBefore.plus(principal),
            description:   `Тіло депозиту повернуто (id: ${depositId})`,
            referenceId:   depositId,
          },
        });

        // FinancialTransaction — відсотковий дохід
        if (interest.gt(0)) {
          const b2 = balanceBefore.plus(principal);
          await tx.financialTransaction.create({
            data: {
              playerId:      dep.playerId,
              type:          'REVENUE_INTEREST',
              amountUah:     interest,
              balanceBefore: b2,
              balanceAfter:  b2.plus(interest),
              description:
                `Відсотки за депозитом ${new Decimal(dep.annualYieldRate.toString()).times(100).toFixed(2)}% ` +
                `× ${dep.durationTicks}д = ₴${interest.toFixed(2)}`,
              referenceId:   depositId,
            },
          });
        }
      }

      // Оновлюємо summary
      summary.depositsMatured++;
      if (dep.currency === 'UAH') {
        summary.interestPaidUah = summary.interestPaidUah.plus(interest);
      } else {
        summary.interestPaidUsd = summary.interestPaidUsd.plus(interest);
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ПРИВАТНЕ — ОВЕРДРАФТ DRAWDOWN
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Покриває від'ємний cashBalance гравця через овердрафтну лінію.
   *
   * cashBalance < 0:
   *   deficit = |cashBalance|
   *   available = overdraftLimitUah − currentOverdraftUsageUah
   *
   *   Якщо deficit ≤ available:
   *     cashBalance → 0
   *     currentOverdraftUsageUah += deficit
   *
   *   Якщо deficit > available:
   *     cashBalance → −(deficit − available)   ← залишок негативу → штатний insolvency
   *     currentOverdraftUsageUah = overdraftLimitUah  (вичерпано)
   */
  private async applyOverdraftDrawdown(
    player: {
      id:                       string;
      cashBalance:              Prisma.Decimal;
      overdraftLimitUah:        Prisma.Decimal;
      currentOverdraftUsageUah: Prisma.Decimal;
    },
    currentTick: bigint,
    summary:     BankingTickSummary,
  ): Promise<void> {
    const balance   = new Decimal(player.cashBalance.toString());
    const limit     = new Decimal(player.overdraftLimitUah.toString());
    const usage     = new Decimal(player.currentOverdraftUsageUah.toString());
    const available = limit.minus(usage);

    if (available.lte(0) || balance.gte(0)) return;

    const deficit  = balance.abs();
    const toDraw   = Decimal.min(deficit, available);
    const newUsage = usage.plus(toDraw);

    // При частковому покритті cashBalance залишається від'ємним на непокрите
    const newBalance = balance.plus(toDraw);   // 0 або < 0 (якщо toDraw < deficit)

    await this.db.$transaction(async tx => {
      await tx.player.update({
        where: { id: player.id },
        data: {
          cashBalance:              newBalance,
          currentOverdraftUsageUah: newUsage,
        },
      });

      await tx.financialTransaction.create({
        data: {
          playerId:      player.id,
          type:          'OVERDRAFT_DRAWDOWN',
          amountUah:     toDraw,
          balanceBefore: balance,
          balanceAfter:  newBalance,
          description:
            `Овердрафт: покрито дефіцит ₴${toDraw.toFixed(0)} ` +
            `(використано ${newUsage.toFixed(0)} / ${limit.toFixed(0)})`,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

    summary.overdraftDrawdowns++;
    summary.overdraftDrawnUah = summary.overdraftDrawnUah.plus(toDraw);

    if (toDraw.lt(deficit)) {
      // Частина дефіциту не покрита — фіксуємо перевищення ліміту
      summary.limitBreachPlayers.push(player.id);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ПРИВАТНЕ — КАПІТАЛІЗАЦІЯ ВІДСОТКІВ
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Нараховує відсотки на залишок овердрафту (капіталізація).
   *
   *   dailyInterest = currentOverdraftUsageUah × (0.36 / 365)
   *   currentOverdraftUsageUah += dailyInterest
   *
   *   Якщо після нарахування usage > overdraftLimitUah:
   *     excess = usage − limit
   *     cashBalance −= excess   (штрафний тиск → запускає insolvency протокол)
   *     currentOverdraftUsageUah = overdraftLimitUah
   *
   * Нарахування завжди виконується — навіть якщо гравець вже у від'ємній зоні.
   */
  private async capitalizeOverdraftInterest(
    player: {
      id:                       string;
      cashBalance:              Prisma.Decimal;
      overdraftLimitUah:        Prisma.Decimal;
      currentOverdraftUsageUah: Prisma.Decimal;
    },
    currentTick: bigint,
    summary:     BankingTickSummary,
  ): Promise<void> {
    const usage   = new Decimal(player.currentOverdraftUsageUah.toString());
    const limit   = new Decimal(player.overdraftLimitUah.toString());
    const balance = new Decimal(player.cashBalance.toString());

    // dailyInterest = usage × (36% / 365)
    const dailyInterest = usage.times(OVERDRAFT_DAILY_RATE);
    if (dailyInterest.lte(0)) return;

    const newUsage = usage.plus(dailyInterest);
    let   newBalance = balance;
    let   finalUsage = newUsage;

    // Перевищення ліміту після капіталізації
    if (newUsage.gt(limit)) {
      const excess = newUsage.minus(limit);
      // Штраф: excess списуємо з cashBalance (провокуємо insolvency-лічильник)
      newBalance   = balance.minus(excess);
      finalUsage   = limit;
    }

    await this.db.$transaction(async tx => {
      await tx.player.update({
        where: { id: player.id },
        data: {
          cashBalance:              newBalance,
          currentOverdraftUsageUah: finalUsage,
        },
      });

      await tx.financialTransaction.create({
        data: {
          playerId:      player.id,
          type:          'OVERDRAFT_INTEREST',
          amountUah:     dailyInterest.negated(),
          balanceBefore: balance,
          balanceAfter:  newBalance,
          description:
            `Відсотки за овердрафт: ₴${dailyInterest.toFixed(2)} ` +
            `(36% р./р. на борг ₴${usage.toFixed(0)})`,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

    summary.overdraftInterestUah = summary.overdraftInterestUah.plus(dailyInterest);

    if (newUsage.gt(limit)) {
      if (!summary.limitBreachPlayers.includes(player.id)) {
        summary.limitBreachPlayers.push(player.id);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ПРИВАТНЕ — ДОПОМІЖНЕ
  // ══════════════════════════════════════════════════════════════════════════

  private resolveRateTier(
    liquidity: Decimal,
  ): 'HIGH' | 'MID' | 'LOW' | 'CRIT' {
    if (liquidity.gte(BUDGET_TIER_HIGH_UAH)) return 'HIGH';
    if (liquidity.gte(BUDGET_TIER_MID_UAH))  return 'MID';
    if (liquidity.gte(BUDGET_TIER_LOW_UAH))  return 'LOW';
    return 'CRIT';
  }
}
