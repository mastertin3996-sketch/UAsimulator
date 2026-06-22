/**
 * ERPAutomationService — правило-базована автоматизація закупівель і зарплат.
 *
 * Два виконавчі методи:
 *   processAutoProcurementTick()  — B2B-автозакупівлі через AutoContract
 *   processAutomatedHRPolicyTick() — автокоригування зарплат за HRAutomationPolicy
 *
 * Оба викликаються TickEngine ПЕРЕД циклом гравців, щоб оновлені зарплати
 * враховувались у поточному HR-тіці.
 *
 * Concurrency safeguards:
 *   - Контракти одного покупця виконуються ПОСЛІДОВНО (for-of з await),
 *     що виключає подвійне витрачання одного балансу в межах одного тіку.
 *   - executeB2BTrade() всередині використовує CAS-транзакцію (UPDATE … WHERE
 *     cashBalance >= cost та WHERE quantityFilled <= total − need), тому навіть
 *     за одночасного запуску кількох серверів дублювання товару або double-spend
 *     неможливі — БД відкине другий UPDATE і відкотить транзакцію.
 *   - Перед кожною угодою перевіряємо залишок бюджету покупця в пам'яті
 *     (pre-check), щоб не викликати явно приречені транзакції.
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { EconomyService } from './EconomyService';

// ── Типи результатів ──────────────────────────────────────────────────────────

export interface ProcurementContractResult {
  contractId:    string;
  resourceType:  string;
  requestedQty:  number;
  filledQty:     number;
  spentUah:      number;
  tradesCount:   number;
  skippedOrders: number;
}

export interface ProcurementTickSummary {
  tick:                bigint;
  contractsProcessed:  number;
  totalTradesExecuted: number;
  totalSpentUah:       Decimal;
  details:             ProcurementContractResult[];
  failures:            Array<{ contractId: string; reason: string }>;
}

export interface HRPolicyTickSummary {
  tick:                      bigint;
  policiesApplied:           number;
  salaryAdjustments:         number;
  totalSalaryIncrementUah:   Decimal;
}

export interface ERPDashboard {
  playerId:                  string;
  cashBalance:               number;
  activeContractsCount:      number;
  totalContractsCount:       number;
  committedSpendPerTickUah:  number;
  lastTickActualSpendUah:    number;
  contracts: Array<{
    id:                string;
    resourceType:      string;
    quantityPerTick:   number;
    maxPricePerUnit:   number;
    minQuality:        number;
    isActive:          boolean;
    sellerId:          string | null;
    lastFilledQty:     number;
    lastTickSpentUah:  number;
    totalSpentUah:     number;
    lastExecutedTick:  string | null;
  }>;
  hrPolicy: {
    isActive:           boolean;
    autoAdjustSalaries: boolean;
    targetMood:         number;
    maxSalaryCapUah:    number;
  } | null;
  alerts: string[];
}

// ═════════════════════════════════════════════════════════════════════════════

export class ERPAutomationService {
  private readonly economy: EconomyService;

  constructor(private readonly db: PrismaClient) {
    this.economy = new EconomyService(db);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // AUTO-PROCUREMENT
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Виконує всі активні AutoContract для всіх гравців.
   *
   * Алгоритм (per-buyer):
   *  1. Зчитуємо поточний баланс покупця (once per buyer).
   *  2. Для кожного контракту (послідовно):
   *     a. Шукаємо відповідні SELL-ордери (resourceType, price ≤ max, quality ≥ min).
   *     b. Сортуємо за price ASC, quality DESC (найдешевший і кращий якістю — першим).
   *     c. Виконуємо угоди через executeB2BTrade() поки не заповнено quantityPerTick.
   *     d. При concurrent-конфлікті → пропускаємо ордер, пробуємо наступний.
   *     e. Оновлюємо lastTickSpentUah, lastFilledQty, totalSpentUah, lastExecutedTick.
   */
  async processAutoProcurementTick(currentTick: bigint): Promise<ProcurementTickSummary> {
    const contracts = await this.db.autoContract.findMany({
      where:   { isActive: true },
      orderBy: [{ buyerId: 'asc' }, { createdAt: 'asc' }],
    });

    const summary: ProcurementTickSummary = {
      tick:                currentTick,
      contractsProcessed:  0,
      totalTradesExecuted: 0,
      totalSpentUah:       new Decimal(0),
      details:             [],
      failures:            [],
    };

    // Group by buyer so we process each buyer's contracts sequentially,
    // avoiding cross-contract double-spend within the same buyer.
    const byBuyer = new Map<string, typeof contracts>();
    for (const c of contracts) {
      const list = byBuyer.get(c.buyerId) ?? [];
      list.push(c);
      byBuyer.set(c.buyerId, list);
    }

    for (const [buyerId, buyerContracts] of byBuyer) {
      // Read buyer balance once; keep in sync manually as trades succeed.
      const buyerRow = await this.db.player.findUnique({
        where:  { id: buyerId },
        select: { cashBalance: true, isBankrupt: true },
      });
      if (!buyerRow || buyerRow.isBankrupt) continue;

      let buyerBalance = new Decimal(buyerRow.cashBalance.toString());

      for (const contract of buyerContracts) {
        let remainingQty     = contract.quantityPerTick;
        let tickSpent        = new Decimal(0);
        let tradesCount      = 0;
        let skippedOrders    = 0;
        let contractFailed   = false;

        // Build quality filter
        const qualityFilter: Prisma.MarketOrderWhereInput =
          contract.minQuality > 0
            ? { quality: { gte: contract.minQuality } }
            : {};

        // Seller filter (null = any seller)
        const sellerFilter: Prisma.MarketOrderWhereInput =
          contract.sellerId ? { playerId: contract.sellerId } : {};

        const sellOrders = await this.db.marketOrder.findMany({
          where: {
            type:         'SELL',
            status:       { in: ['OPEN', 'PARTIALLY_FILLED'] },
            expiresAt:    { gt: new Date() },
            resourceType: contract.resourceType,
            pricePerUnit: { lte: contract.maxPricePerUnit },
            ...qualityFilter,
            ...sellerFilter,
            playerId: { not: buyerId },  // no self-trade
          },
          orderBy: [{ pricePerUnit: 'asc' }, { quality: 'desc' }],
        });

        for (const order of sellOrders) {
          if (remainingQty <= 0.001) break;

          const available = order.quantityTotal - order.quantityFilled;
          if (available <= 0.001) { skippedOrders++; continue; }

          const tradeQty  = Math.min(remainingQty, available);
          const tradeCost = new Decimal(order.pricePerUnit.toString()).times(tradeQty);

          // Pre-check: skip if buyer clearly can't afford this trade
          if (buyerBalance.lessThan(tradeCost)) { skippedOrders++; continue; }

          try {
            const receipt = await this.economy.executeB2BTrade(buyerId, order.id, tradeQty);
            tickSpent    = tickSpent.plus(receipt.grossCostUah);
            buyerBalance = buyerBalance.minus(receipt.grossCostUah);
            remainingQty -= tradeQty;
            tradesCount++;
            summary.totalTradesExecuted++;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            // Known transient errors: concurrent conflict, sold out, cancelled, expired
            const isTransient =
              msg.includes('Concurrent conflict') ||
              msg.includes('fully sold out')       ||
              msg.includes('cancelled')             ||
              msg.includes('expired')               ||
              msg.includes('Insufficient funds');

            if (isTransient) {
              skippedOrders++;
              continue; // try next order
            }

            // Unknown error — abort this contract, log it
            summary.failures.push({ contractId: contract.id, reason: msg });
            contractFailed = true;
            break;
          }
        }

        const filledQty = contract.quantityPerTick - remainingQty;

        // Persist per-tick execution stats
        await this.db.autoContract.update({
          where: { id: contract.id },
          data: {
            lastTickSpentUah: tickSpent,
            lastFilledQty:    filledQty,
            lastExecutedTick: currentTick,
            totalSpentUah:    { increment: tickSpent },
          },
        });

        summary.contractsProcessed++;
        summary.totalSpentUah = summary.totalSpentUah.plus(tickSpent);
        summary.details.push({
          contractId:   contract.id,
          resourceType: contract.resourceType,
          requestedQty: contract.quantityPerTick,
          filledQty,
          spentUah:     tickSpent.toNumber(),
          tradesCount,
          skippedOrders,
        });

        if (contractFailed) continue;
      }
    }

    return summary;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // AUTO-HR POLICY
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Для кожного активного HRAutomationPolicy:
   *  — знаходить усіх співробітників гравця з mood < targetMood
   *  — розраховує нову зарплату: max(cityBaseline × 1.05, currentSalary × 1.10)
   *  — обмежує до maxSalaryCapUah
   *  — оновлює salaryUah атомарно
   *
   * Зміни зарплати набудуть чинності у HR-тіці поточного тику
   * (оскільки цей метод викликається ДО циклу гравців у TickEngine).
   */
  async processAutomatedHRPolicyTick(currentTick: bigint): Promise<HRPolicyTickSummary> {
    const policies = await this.db.hRAutomationPolicy.findMany({
      where: { isActive: true, autoAdjustSalaries: true },
    });

    const summary: HRPolicyTickSummary = {
      tick:                    currentTick,
      policiesApplied:         0,
      salaryAdjustments:       0,
      totalSalaryIncrementUah: new Decimal(0),
    };

    for (const policy of policies) {
      const employees = await this.db.employee.findMany({
        where: {
          playerId: policy.playerId,
          mood:     { lt: policy.targetMood },
          isOnStrike: false,
        },
        include: {
          enterprise: {
            include: {
              landPlot: {
                include: { city: { select: { wageBaselineUah: true, wageCoefficient: true } } },
              },
            },
          },
        },
      });

      const cap = new Decimal(policy.maxSalaryCapUah.toString());

      for (const emp of employees) {
        const city    = emp.enterprise.landPlot.city;
        // Competitive market baseline for this city tier
        const cityBaseline = new Decimal(city.wageBaselineUah.toString())
          .times(city.wageCoefficient);
        // Target: at least 5% above city baseline
        const targetSalary  = cityBaseline.times('1.05');
        const currentSalary = new Decimal(emp.salaryUah.toString());

        // New salary = max(targetSalary, currentSalary × 1.10)
        const bumped    = currentSalary.times('1.10');
        let newSalary   = bumped.greaterThan(targetSalary) ? bumped : targetSalary;

        // Apply cap
        if (newSalary.greaterThan(cap)) newSalary = cap;

        // Skip if no actual increase
        if (newSalary.lessThanOrEqualTo(currentSalary)) continue;

        await this.db.employee.update({
          where: { id: emp.id },
          data:  { salaryUah: newSalary },
        });

        summary.salaryAdjustments++;
        summary.totalSalaryIncrementUah = summary.totalSalaryIncrementUah.plus(
          newSalary.minus(currentSalary),
        );
      }

      summary.policiesApplied++;
    }

    return summary;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ERP DASHBOARD
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Повертає зведений стан ERP-автоматизації гравця:
   *  - перелік усіх AutoContract (активних і неактивних)
   *  - статус HRAutomationPolicy
   *  - committed spend per tick (worst-case: всі контракти виконуються повністю)
   *  - actual spend у останньому тіці (з поля lastTickSpentUah)
   *  - попередження про низький баланс або банкрутство
   */
  async getERPAutomationDashboard(playerId: string): Promise<ERPDashboard> {
    const [player, contracts, hrPolicy] = await Promise.all([
      this.db.player.findUniqueOrThrow({
        where:  { id: playerId },
        select: { cashBalance: true, isBankrupt: true },
      }),
      this.db.autoContract.findMany({
        where:   { buyerId: playerId },
        orderBy: { createdAt: 'asc' },
      }),
      this.db.hRAutomationPolicy.findUnique({
        where: { playerId },
      }),
    ]);

    const balance        = new Decimal(player.cashBalance.toString());
    const activeContracts = contracts.filter(c => c.isActive);

    // Worst-case committed spend per tick
    const committedPerTick = activeContracts.reduce(
      (s, c) => s.plus(new Decimal(c.maxPricePerUnit.toString()).times(c.quantityPerTick)),
      new Decimal(0),
    );

    // Sum of last-tick actual spend across all active contracts
    const lastTickTotalSpent = activeContracts.reduce(
      (s, c) => s.plus(new Decimal(c.lastTickSpentUah.toString())),
      new Decimal(0),
    );

    // Balance health alerts
    const alerts: string[] = [];
    if (player.isBankrupt) {
      alerts.push('BANKRUPT: All auto-contracts suspended until insolvency is resolved.');
    } else if (committedPerTick.greaterThan(0) && balance.lessThan(committedPerTick.times(3))) {
      alerts.push(
        `LOW_BALANCE: Cash reserve (₴${balance.toFixed(0)}) covers fewer than 3 ticks ` +
        `of committed auto-procurement (₴${committedPerTick.toFixed(0)}/tick).`,
      );
    }

    return {
      playerId,
      cashBalance:              balance.toNumber(),
      activeContractsCount:     activeContracts.length,
      totalContractsCount:      contracts.length,
      committedSpendPerTickUah: committedPerTick.toNumber(),
      lastTickActualSpendUah:   lastTickTotalSpent.toNumber(),
      contracts: contracts.map(c => ({
        id:               c.id,
        resourceType:     c.resourceType,
        quantityPerTick:  c.quantityPerTick,
        maxPricePerUnit:  Number(c.maxPricePerUnit.toString()),
        minQuality:       c.minQuality,
        isActive:         c.isActive,
        sellerId:         c.sellerId,
        lastFilledQty:    c.lastFilledQty,
        lastTickSpentUah: Number(c.lastTickSpentUah.toString()),
        totalSpentUah:    Number(c.totalSpentUah.toString()),
        lastExecutedTick: c.lastExecutedTick?.toString() ?? null,
      })),
      hrPolicy: hrPolicy
        ? {
            isActive:           hrPolicy.isActive,
            autoAdjustSalaries: hrPolicy.autoAdjustSalaries,
            targetMood:         hrPolicy.targetMood,
            maxSalaryCapUah:    Number(hrPolicy.maxSalaryCapUah.toString()),
          }
        : null,
      alerts,
    };
  }
}
