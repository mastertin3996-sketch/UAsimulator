/**
 * TickEngine — master orchestrator for one game-day tick.
 *
 * Tick schedule (1 real-hour interval):
 *  1. Expire stale market orders
 *  2. Per player (sequential to avoid cross-player lock contention):
 *     a. Advance construction projects
 *     b. Run production (yields: utilisationMap, overworkedEntIds)
 *     c. Process NPC retail sales
 *     d. Charge energy bills          (uses utilisationMap)
 *     e. Apply equipment degradation  (uses utilisationMap)
 *     f. Process HR tick              (uses overworkedEntIds)
 *     g. Every 30 ticks: disburse salaries + calculate taxes + pay land leases
 *  3. Cross-player B2B order matching (once per tick, after all production)
 *  4. Collect overdue taxes
 *  5. Record tick completion
 */

import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma as defaultPrisma } from '../lib/prisma';
import { ProductionService }     from './ProductionService';
import { EnergyBillingService }  from './EnergyBillingService';
import { EquipmentService }      from './EquipmentService';
import { HRService }             from './HRService';
import { MarketService }         from './MarketService';
import { TaxService }            from './TaxService';
import { LoanService }           from './LoanService';
import { LogisticsService }      from './LogisticsService';
import { FinanceService }              from './FinanceService';
import { StateRegulationService }     from './StateRegulationService';
import { ResearchDevelopmentService } from './ResearchDevelopmentService';
import { AnalyticsService }           from './AnalyticsService';
import { ERPAutomationService }       from './ERPAutomationService';
import { FiscalBudgetService }        from './FiscalBudgetService';
import { ForeignTradeService }        from './ForeignTradeService';
import { EnergyMarketService }        from './EnergyMarketService';
import { CorporateSecurityService }   from './CorporateSecurityService';
import { CompanyValuationService }    from './CompanyValuationService';
import { BankingLiquidityService }   from './BankingLiquidityService';
import { StockExchangeService }      from './StockExchangeService';
import { TICKS_PER_MONTH, TICKS_PER_SNAPSHOT } from '../constants/economic';

interface TickSummary {
  tickNumber:     bigint;
  gameDay:        bigint;
  durationMs:     number;
  playersProcessed: number;
  ordersExpired:  number;
  tradesExecuted: number;
  errors:         Array<{ playerId: string; error: string }>;
}

export class TickEngine {
  private readonly production:  ProductionService;
  private readonly energy:      EnergyBillingService;
  private readonly equipment:   EquipmentService;
  private readonly hr:          HRService;
  private readonly market:      MarketService;
  private readonly tax:         TaxService;
  private readonly loans:       LoanService;
  private readonly logistics:   LogisticsService;
  private readonly finance:     FinanceService;
  private readonly regulation:  StateRegulationService;
  private readonly rd:          ResearchDevelopmentService;
  private readonly analytics:   AnalyticsService;
  private readonly erp:         ERPAutomationService;
  private readonly fiscal:      FiscalBudgetService;
  private readonly foreign:     ForeignTradeService;
  private readonly energyMarket:  EnergyMarketService;
  private readonly corpSecurity:   CorporateSecurityService;
  private readonly valuation:      CompanyValuationService;
  private readonly banking:        BankingLiquidityService;
  private readonly stockExchange:  StockExchangeService;
  private readonly db:             PrismaClient;

  constructor(prismaClient: PrismaClient = defaultPrisma) {
    this.db         = prismaClient;
    this.rd         = new ResearchDevelopmentService(prismaClient);
    this.analytics  = new AnalyticsService(prismaClient);
    this.production = new ProductionService(prismaClient, this.rd);
    this.energy     = new EnergyBillingService(prismaClient, this.rd);
    this.equipment  = new EquipmentService(prismaClient);
    this.hr         = new HRService(prismaClient);
    this.market     = new MarketService(prismaClient);
    this.tax        = new TaxService(prismaClient);
    this.loans      = new LoanService(prismaClient);
    this.logistics  = new LogisticsService(prismaClient, this.rd);
    this.finance    = new FinanceService(prismaClient);
    this.regulation = new StateRegulationService(prismaClient);
    this.erp        = new ERPAutomationService(prismaClient);
    this.fiscal     = new FiscalBudgetService(prismaClient);
    this.foreign       = new ForeignTradeService(prismaClient);
    this.energyMarket  = new EnergyMarketService(prismaClient);
    this.corpSecurity  = new CorporateSecurityService(prismaClient);
    this.valuation     = new CompanyValuationService(prismaClient);
    this.banking       = new BankingLiquidityService(prismaClient);
    this.stockExchange = new StockExchangeService(prismaClient);
  }

  /**
   * Entry point.  Determines the next tick number, runs the full pipeline,
   * records completion, and returns a summary.
   */
  async processNextTick(): Promise<TickSummary> {
    const startMs = Date.now();

    // ── Determine tick number ────────────────────────────────────────────
    const lastTick = await this.db.gameTick.findFirst({ orderBy: { tickNumber: 'desc' } });
    const tickNumber = lastTick ? lastTick.tickNumber + 1n : 1n;
    const gameDay    = tickNumber; // 1 tick = 1 game day

    const tickRecord = await this.db.gameTick.create({
      data: { tickNumber, gameDay, startedAt: new Date() },
    });

    const errors: Array<{ playerId: string; error: string }> = [];

    // ── 1. Expire stale orders ───────────────────────────────────────────
    const ordersExpired = await this.market.expireStaleOrders();

    // ── 2. Per-player processing ─────────────────────────────────────────
    const players = await this.db.player.findMany({
      select: { id: true },
      // In production, you'd only process players active in the last N hours
    });

    // Pre-load all unlocked technologies into memory once before the player loop.
    // Modifier getters (getProductionQualityModifier etc.) then do O(1) Map lookups.
    await this.rd.warmTickCache(players.map(p => p.id));

    // ── 1b. ERP: HR automation — adjust salaries BEFORE HR tick runs ─────
    const hrPolicySummary = await this.erp.processAutomatedHRPolicyTick(tickNumber)
      .catch(e => {
        console.error(`[Tick ${tickNumber}] HR automation failed:`, e);
        return null;
      });
    if (hrPolicySummary) {
      console.log(
        `[Tick ${tickNumber}] HR Policy: ${hrPolicySummary.policiesApplied} policies, ` +
        `${hrPolicySummary.salaryAdjustments} salary bumps ` +
        `(+₴${hrPolicySummary.totalSalaryIncrementUah.toFixed(0)} total).`,
      );
    }

    // ── 1c. ERP: Auto-procurement — B2B auto-contracts for all players ───
    const procurementSummary = await this.erp.processAutoProcurementTick(tickNumber)
      .catch(e => {
        console.error(`[Tick ${tickNumber}] Auto-procurement failed:`, e);
        return null;
      });
    if (procurementSummary) {
      console.log(
        `[Tick ${tickNumber}] Auto-procurement: ${procurementSummary.contractsProcessed} contracts, ` +
        `${procurementSummary.totalTradesExecuted} trades, ` +
        `₴${procurementSummary.totalSpentUah.toFixed(0)} spent.`,
      );
    }

    for (const { id: playerId } of players) {
      try {
        await this.processPlayerTick(playerId, tickNumber, gameDay);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ playerId, error: message });
        console.error(`[Tick ${tickNumber}] Player ${playerId} failed:`, message);
      }
    }

    // ── 2b. Training sessions tick ───────────────────────────────────────
    await this.processTrainingSessions().catch(e =>
      console.error(`[Tick ${tickNumber}] Training sessions failed:`, e)
    );

    // ── 2c. Supply route transfers (intra-company, per player) ──────────
    const supplyTransfers = await this.processSupplyRoutes().catch(e => {
      console.error(`[Tick ${tickNumber}] Supply routes failed:`, e);
      return 0;
    });
    if (supplyTransfers > 0) {
      console.log(`[Tick ${tickNumber}] Supply routes: ${supplyTransfers} transfers executed.`);
    }

    // ── 3. Global B2B market matching ────────────────────────────────────
    const trades = await this.market.matchOrders();

    // ── 3b. Advance pending deliveries (global, all players) ─────────────
    const logisticsSummary = await this.logistics.processLogisticsTick(tickNumber)
      .catch(e => {
        console.error(`[Tick ${tickNumber}] Logistics tick failed:`, e);
        return null;
      });
    if (logisticsSummary) {
      console.log(
        `[Tick ${tickNumber}] Logistics: ${logisticsSummary.arrivals} arrivals, ` +
        `${logisticsSummary.spoilageEvents} spoilage events, ` +
        `${logisticsSummary.failedDeliveries} failed.`,
      );
    }

    // ── 3c. Finance tick: daily loan payments + insolvency/bankruptcy checks ─
    const financeSummary = await this.finance.processFinancialTick(tickNumber)
      .catch(e => {
        console.error(`[Tick ${tickNumber}] Finance tick failed:`, e);
        return null;
      });
    if (financeSummary) {
      console.log(
        `[Tick ${tickNumber}] Finance: ${financeSummary.loanPaymentsCount} loan payments ` +
        `(₴${financeSummary.totalDeductedUah.toFixed(0)}), ` +
        `${financeSummary.newInsolvencies} new insolvencies, ` +
        `${financeSummary.newBankruptcies} bankruptcies, ` +
        `${financeSummary.recoveries} recoveries.`,
      );
    }

    // ── 3d. Regulation tick: compliance, licenses, macro events ──────────
    const regulationSummary = await this.regulation.processRegulationTick(tickNumber)
      .catch(e => {
        console.error(`[Tick ${tickNumber}] Regulation tick failed:`, e);
        return null;
      });
    if (regulationSummary) {
      console.log(
        `[Tick ${tickNumber}] Regulation: ${regulationSummary.auditsTriggered} audits, ` +
        `${regulationSummary.licenseExpiries} licenses expired, ` +
        `${regulationSummary.enterprisesUnfrozen} unfrozen, ` +
        (regulationSummary.macroEvent.fired
          ? `macro event: ${regulationSummary.macroEvent.type}.`
          : 'no macro event.'),
      );
    }

    // ── 3h. Energy market: solar battery update, diesel billing, SOLAR/DIESEL enterprises ─
    const energySummary = await this.energyMarket.processEnergyMarketTick(tickNumber)
      .catch(e => {
        console.error(`[Tick ${tickNumber}] EnergyMarket tick failed:`, e);
        return null;
      });
    if (energySummary) {
      console.log(
        `[Tick ${tickNumber}] EnergyMarket: ☀ coeff ${energySummary.sunCoefficient.toFixed(3)} ` +
        `| solar ${energySummary.solarEnterprisesCount} ent (${energySummary.totalGenerationKwh.toFixed(0)} kWh gen) ` +
        `| diesel ${energySummary.dieselEnterprisesCount} ent (₴${energySummary.totalDieselCostUah.toFixed(0)}) ` +
        `| saved ₴${energySummary.totalSolarSavingsUah.toFixed(0)} ` +
        (energySummary.outageAffectedCities.length
          ? `| outage cities: ${energySummary.outageAffectedCities.length}`
          : ''),
      );
    }

    // ── 3i. Corporate security: maintenance, patent freeze, hostile asset freeze ─
    const securitySummary = await this.corpSecurity.processSecurityTick(tickNumber)
      .catch(e => {
        console.error(`[Tick ${tickNumber}] CorporateSecurity tick failed:`, e);
        return null;
      });
    if (securitySummary) {
      console.log(
        `[Tick ${tickNumber}] CorpSecurity: ` +
        `${securitySummary.systemsCharged} systems ₴${securitySummary.totalMaintenanceUah.toFixed(0)} ` +
        `| +${securitySummary.newFreezes} freezes ` +
        `| −${securitySummary.liftedFreezes} lifted ` +
        `| ${securitySummary.totalFrozenCount} total frozen.`,
      );
    }

    // ── 3g. Foreign trade: commodity tickers, FX rate, customs clearing ─────
    const tradeSummary = await this.foreign.processTradeTick(tickNumber)
      .catch(e => {
        console.error(`[Tick ${tickNumber}] ForeignTrade tick failed:`, e);
        return null;
      });
    if (tradeSummary) {
      console.log(
        `[Tick ${tickNumber}] ForeignTrade: FX ₴${tradeSummary.fxRate.toFixed(4)}/$ ` +
        `| exports cleared ${tradeSummary.exportsCleared} ` +
        `| imports cleared ${tradeSummary.importsCleared} ` +
        `| frozen ${tradeSummary.frozenImportsClearAttempted} ` +
        `| storage fees ${tradeSummary.storageFeesCharged}.`,
      );
    }

    // ── 3e. Fiscal: aggregate taxes into StateBudget every 24 ticks ────────
    if (tickNumber % TICKS_PER_SNAPSHOT === 0n) {
      const fiscalSummary = await this.fiscal.collectTaxesAndAggregate(tickNumber)
        .catch(e => {
          console.error(`[Tick ${tickNumber}] Fiscal aggregation failed:`, e);
          return null;
        });
      if (fiscalSummary) {
        console.log(
          `[Tick ${tickNumber}] Fiscal: +₴${fiscalSummary.newTotalUah.toFixed(0)} ` +
          `(ПДВ ₴${fiscalSummary.newVatUah.toFixed(0)} + OPEX ₴${fiscalSummary.newOpexTaxUah.toFixed(0)}), ` +
          `net budget ₴${fiscalSummary.budgetBalance.toFixed(0)}.`,
        );
      }
    }

    // ── 3j. Company Valuation: recalculate every TICKS_PER_SNAPSHOT ──────────
    if (tickNumber % TICKS_PER_SNAPSHOT === 0n) {
      for (const { id: playerId } of players) {
        await this.valuation.calculateCompanyValuation(playerId).catch(e =>
          console.error(`[Tick ${tickNumber}] Valuation failed for ${playerId}:`, e),
        );
      }
    }

    // ── 3f. Fiscal: inflation & tariff adjustment every 30 ticks ────────────
    if (tickNumber % TICKS_PER_MONTH === 0n) {
      const inflationResult = await this.fiscal.calculateInflationAndTariffIndex()
        .catch(e => {
          console.error(`[Tick ${tickNumber}] Inflation calc failed:`, e);
          return null;
        });
      if (inflationResult) {
        console.log(
          `[Tick ${tickNumber}] Inflation [${inflationResult.pressureCategory}]: ` +
          `tariff ${inflationResult.tariffDeltaPct >= 0 ? '+' : ''}${inflationResult.tariffDeltaPct.toFixed(1)}%, ` +
          `wage ${inflationResult.wageDeltaPct >= 0 ? '+' : ''}${inflationResult.wageDeltaPct.toFixed(1)}% ` +
          `(avg tariff ₴${inflationResult.newAvgTariffUah.toFixed(4)}/kWh).`,
        );
      }
    }

    // ── 3k. Banking: mature deposits + overdraft coverage + interest accrual ─
    // Виконується ПІСЛЯ всіх billing-сервісів, щоб захопити всі від'ємні залишки.
    const bankingSummary = await this.banking.processBankingTick(tickNumber)
      .catch(e => {
        console.error(`[Tick ${tickNumber}] Banking tick failed:`, e);
        return null;
      });
    if (bankingSummary) {
      const msgs: string[] = [];
      if (bankingSummary.depositsMatured > 0) {
        msgs.push(
          `${bankingSummary.depositsMatured} dep matured ` +
          `(UAH ₴${bankingSummary.interestPaidUah.toFixed(0)} + ` +
          `USD $${bankingSummary.interestPaidUsd.toFixed(2)} interest)`,
        );
      }
      if (bankingSummary.overdraftDrawdowns > 0) {
        msgs.push(
          `${bankingSummary.overdraftDrawdowns} OD draws ₴${bankingSummary.overdraftDrawnUah.toFixed(0)}`,
        );
      }
      if (bankingSummary.overdraftInterestUah.gt(0)) {
        msgs.push(`OD interest ₴${bankingSummary.overdraftInterestUah.toFixed(2)}`);
      }
      if (bankingSummary.limitBreachPlayers.length > 0) {
        msgs.push(`OD LIMIT BREACH: ${bankingSummary.limitBreachPlayers.join(', ')}`);
      }
      if (msgs.length > 0) {
        console.log(`[Tick ${tickNumber}] Banking: ${msgs.join(' | ')}.`);
      }
    }

    // ── 3l. Stock Exchange: NPC price correction + order matching ─────────
    const stockSummary = await this.stockExchange.processStockMarketTick(tickNumber)
      .catch(e => {
        console.error(`[Tick ${tickNumber}] StockExchange tick failed:`, e);
        return null;
      });
    if (stockSummary && (stockSummary.totalTradesExecuted > 0 || stockSummary.npcCorrections > 0)) {
      console.log(
        `[Tick ${tickNumber}] StockExchange: ${stockSummary.tickersProcessed} tickers ` +
        `| ${stockSummary.totalTradesExecuted} trades ` +
        `₴${stockSummary.totalVolumeUah.toFixed(0)} vol ` +
        `| ${stockSummary.npcCorrections} NPC corrections.`,
      );
    }

    // ── 4. Collect overdue taxes from all players ─────────────────────────
    for (const { id: playerId } of players) {
      await this.tax.collectOverdueTaxes(playerId).catch(e =>
        console.error(`[Tick ${tickNumber}] Tax collection failed for ${playerId}:`, e),
      );
    }

    // ── 5. Complete tick record ───────────────────────────────────────────
    const durationMs = Date.now() - startMs;
    await this.db.gameTick.update({
      where: { id: tickRecord.id },
      data:  { completedAt: new Date(), durationMs },
    });

    console.log(
      `[Tick ${tickNumber}] Done in ${durationMs}ms. ` +
      `Players: ${players.length}, Trades: ${trades.length}, Expired: ${ordersExpired}`,
    );

    return {
      tickNumber,
      gameDay,
      durationMs,
      playersProcessed:  players.length,
      ordersExpired,
      tradesExecuted:    trades.length,
      errors,
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // PRIVATE — single-player tick pipeline
  // ────────────────────────────────────────────────────────────────────────────

  private async processPlayerTick(
    playerId:   string,
    tickNumber: bigint,
    gameDay:    bigint,
  ): Promise<void> {
    // ── a. Construction progress ─────────────────────────────────────────
    await this.advanceConstruction(playerId, tickNumber);

    // ── b. Production ────────────────────────────────────────────────────
    const { results: productionResults, utilisationByWorkshop, overworkedEnterpriseIds } =
      await this.production.processProduction(playerId);

    // ── c. NPC retail sales ──────────────────────────────────────────────
    await this.market.processNpcSales(playerId, tickNumber);

    // ── d. Energy billing ────────────────────────────────────────────────
    await this.energy.calculateAndBillEnergy(playerId, tickNumber, utilisationByWorkshop);

    // ── e. Equipment degradation ─────────────────────────────────────────
    await this.equipment.processDegradation(playerId, utilisationByWorkshop);

    // ── f. HR tick ───────────────────────────────────────────────────────
    await this.hr.processTick(playerId, tickNumber, overworkedEnterpriseIds);

    // ── g. Перевірка прострочених кредитів (щотіково) ───────────────────
    await this.loans.checkOverdueLoans(playerId, tickNumber);

    // ── i. R&D — generate research points for RD_LABORATORY enterprises ──
    await this.rd.processResearchTick(playerId, tickNumber);

    // ── j. Analytics: record production output + weekly snapshot ─────────
    await this.analytics.recordProductionResults(playerId, productionResults, tickNumber);
    if (tickNumber % TICKS_PER_SNAPSHOT === 0n) {
      await this.analytics.populateDailySnapshot(playerId, tickNumber).catch(e =>
        console.error(`[Tick ${tickNumber}] Snapshot failed for ${playerId}:`, e),
      );
    }

    // ── h. Monthly obligations ───────────────────────────────────────────
    if (tickNumber % TICKS_PER_MONTH === 0n) {
      await this.processMonthlyObligations(playerId, tickNumber, gameDay);
    }
  }

  // ────────────────────────────────────────────────────────────────────────────

  private async advanceConstruction(playerId: string, tickNumber: bigint): Promise<void> {
    const projects = await this.db.constructionProject.findMany({
      where:   { status: 'IN_PROGRESS', enterprise: { playerId } },
      include: { enterprise: true },
    });

    for (const proj of projects) {
      const newRemaining = proj.ticksRemaining - 1;

      if (newRemaining <= 0) {
        // Construction complete — activate the target entity
        await this.db.constructionProject.update({
          where: { id: proj.id },
          data:  { ticksRemaining: 0, status: 'COMPLETED', completedAt: new Date() },
        });

        if (proj.targetType === 'ENTERPRISE') {
          await this.db.enterprise.update({
            where: { id: proj.targetId },
            data:  { isOperational: true, constructedAt: new Date() },
          });

          // If this is an OFFICE enterprise, mark the Office row operational too
          const ent = await this.db.enterprise.findUnique({ where: { id: proj.targetId } });
          if (ent?.type === 'OFFICE') {
            await this.db.office.updateMany({
              where: { enterpriseId: proj.targetId },
              data:  { isOperational: true },
            });
          }
        } else if (proj.targetType === 'WORKSHOP') {
          // Deduct footprint from enterprise used area
          await this.db.workshop.update({
            where: { id: proj.targetId },
            data:  { isActive: true },
          });
          await this.db.enterprise.update({
            where: { id: proj.enterpriseId },
            data:  { usedFloorAreaM2: { increment: proj.footprintM2 } },
          });
        }
      } else {
        await this.db.constructionProject.update({
          where: { id: proj.id },
          data:  { ticksRemaining: newRemaining },
        });

        // Charge daily construction cost installment (spread over ticksRequired)
        const dailyCost = new Decimal(proj.totalCostUah.toString()).dividedBy(proj.ticksRequired);
        const player    = await this.db.player.findUniqueOrThrow({ where: { id: proj.enterprise.playerId } });
        const before    = new Decimal(player.cashBalance.toString());
        const after     = before.minus(dailyCost);

        await this.db.$transaction([
          this.db.player.update({
            where: { id: proj.enterprise.playerId },
            data:  { cashBalance: { decrement: dailyCost } },   // Decimal ✓
          }),
          this.db.constructionProject.update({
            where: { id: proj.id },
            data:  { paidCostUah: { increment: dailyCost } },   // Decimal ✓
          }),
          this.db.financialTransaction.create({
            data: {
              playerId:      proj.enterprise.playerId,
              type:          'CONSTRUCTION_COST',
              amountUah:     dailyCost.negated(),                // Decimal ✓
              balanceBefore: before,                             // Decimal ✓
              balanceAfter:  after,                              // Decimal ✓
              description:   `Construction installment: ${proj.name} (tick ${tickNumber})`,
              referenceId:   proj.id,
            },
          }),
        ]);
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────────────

  private async processMonthlyObligations(
    playerId:   string,
    tickNumber: bigint,
    gameDay:    bigint,
  ): Promise<void> {
    // Period dates for tax reporting
    const now           = new Date();
    const monthMs       = 30 * 24 * 60 * 60 * 1000; // 30 real-hours in ms
    const periodEndDate   = now;
    const periodStartDate = new Date(now.getTime() - monthMs);

    // 1. Disburse salaries
    await this.hr.disburseSalaries(playerId, tickNumber);

    // 2. Tax calculation
    await this.tax.calculateMonthlyTax(playerId, tickNumber, periodStartDate, periodEndDate);

    // 3. Land lease payments
    await this.payLandLeases(playerId, tickNumber);

    // 4. Loan repayments
    await this.loans.processMonthlyRepayments(playerId, tickNumber);
  }

  private async payLandLeases(playerId: string, tickNumber: bigint): Promise<void> {
    const leasedPlots = await this.db.landPlot.findMany({
      where:   { playerId, status: 'LEASED' },
      include: { city: true },
    });

    for (const plot of leasedPlots) {
      // monthlyLeaseCostUah — фіксована місячна орендна плата (Decimal)
      const monthlyLease = new Decimal(plot.monthlyLeaseCostUah.toString());
      const player       = await this.db.player.findUniqueOrThrow({ where: { id: playerId } });
      const before       = new Decimal(player.cashBalance.toString());
      const after        = before.minus(monthlyLease);

      await this.db.$transaction([
        this.db.player.update({
          where: { id: playerId },
          data:  { cashBalance: { decrement: monthlyLease } },  // Decimal ✓
        }),
        this.db.financialTransaction.create({
          data: {
            playerId,
            type:          'LAND_LEASE_PAYMENT',
            amountUah:     monthlyLease.negated(),               // Decimal ✓
            balanceBefore: before,                               // Decimal ✓
            balanceAfter:  after,                                // Decimal ✓
            description:
              `Оренда ділянки: ${plot.cadastralNumber} ` +
              `(${plot.totalAreaM2} м²) — ₴${monthlyLease.toFixed(2)}/міс.`,
            referenceId:   plot.id,
          },
        }),
      ]);
    }
  }

  private async processTrainingSessions(): Promise<void> {
    const sessions = await this.db.trainingSession.findMany({
      where: { isCompleted: false },
      select: { id: true, employeeId: true, targetLevel: true, ticksRemaining: true },
    });

    for (const s of sessions) {
      const newRemaining = s.ticksRemaining - 1;
      if (newRemaining <= 0) {
        // Complete training: upgrade employee qualificationLevel + boost baseEfficiency
        const BONUS: Record<number, number> = { 1: 0.05, 2: 0.10, 3: 0.15, 4: 0.20, 5: 0.25 };
        const bonus = BONUS[s.targetLevel] ?? 0;
        await this.db.$transaction([
          this.db.trainingSession.update({
            where: { id: s.id },
            data:  { isCompleted: true, ticksRemaining: 0, completedAt: new Date() },
          }),
          this.db.employee.update({
            where: { id: s.employeeId },
            data:  {
              qualificationLevel: s.targetLevel,
              baseEfficiency: { increment: bonus },
              efficiency:     { increment: bonus },
            },
          }),
        ]);
      } else {
        await this.db.trainingSession.update({
          where: { id: s.id },
          data:  { ticksRemaining: newRemaining },
        });
      }
    }
  }

  private async processSupplyRoutes(): Promise<number> {
    const routes = await this.db.supplyRoute.findMany({
      where: { isActive: true },
      select: {
        id:                 true,
        sourceEnterpriseId: true,
        targetEnterpriseId: true,
        productId:          true,
        qtyPerTick:         true,
      },
    });

    let transfers = 0;
    for (const route of routes) {
      const srcInv = await this.db.enterpriseInventory.findUnique({
        where: { enterpriseId_productId: { enterpriseId: route.sourceEnterpriseId, productId: route.productId } },
      });
      if (!srcInv || Number(srcInv.quantity) < route.qtyPerTick) continue;

      const qty     = route.qtyPerTick;
      const quality = Number(srcInv.avgQuality);

      await this.db.$transaction([
        // Deduct from source
        this.db.enterpriseInventory.update({
          where: { enterpriseId_productId: { enterpriseId: route.sourceEnterpriseId, productId: route.productId } },
          data:  { quantity: { decrement: qty } },
        }),
        // Credit to target (upsert)
        this.db.enterpriseInventory.upsert({
          where:  { enterpriseId_productId: { enterpriseId: route.targetEnterpriseId, productId: route.productId } },
          create: { enterpriseId: route.targetEnterpriseId, productId: route.productId, quantity: qty, avgQuality: quality },
          update: { quantity: { increment: qty } },
        }),
      ]);
      transfers++;
    }
    return transfers;
  }
}
