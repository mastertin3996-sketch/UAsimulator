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

    // Parallel player processing — players operate on disjoint data rows
    await Promise.all(players.map(async ({ id: playerId }) => {
      try {
        await this.processPlayerTick(playerId, tickNumber, gameDay);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ playerId, error: message });
        console.error(`[Tick ${tickNumber}] Player ${playerId} failed:`, message);
      }
    }));

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

    // Write market-fill notifications in bulk (group by seller + buyer)
    if (trades.length > 0) {
      const productNames = await this.db.product.findMany({
        where:  { id: { in: [...new Set(trades.map((t) => t.productId))] } },
        select: { id: true, nameUa: true },
      });
      const nameMap = new Map(productNames.map((p) => [p.id, p.nameUa]));

      const notifRows: { playerId: string; type: string; title: string; body: string; entityId: string }[] = [];
      for (const t of trades) {
        const product = nameMap.get(t.productId) ?? t.productId;
        const price   = Number(t.pricePerUnit).toFixed(2);
        notifRows.push({
          playerId: t.sellerPlayerId,
          type:     "MARKET_FILLED",
          title:    "Ордер виконано",
          body:     `Продано ${t.quantity.toFixed(0)} од. "${product}" @ ₴${price}. Виручка: ₴${t.sellerRevenue.toFixed(2)}`,
          entityId: t.sellOrderId,
        });
        notifRows.push({
          playerId: t.buyerPlayerId,
          type:     "MARKET_FILLED",
          title:    "Закупку виконано",
          body:     `Куплено ${t.quantity.toFixed(0)} од. "${product}" @ ₴${price}. Витрати: ₴${t.buyerCost.toFixed(2)}`,
          entityId: t.buyOrderId,
        });
      }
      await this.db.notification.createMany({ data: notifRows });
    }

    // ── 3b–3i. Independent global services in parallel ───────────────────
    const [logisticsSummary, financeSummary, regulationSummary, energySummary, securitySummary, tradeSummary] =
      await Promise.all([
        this.logistics.processLogisticsTick(tickNumber)
          .catch(e => { console.error(`[Tick ${tickNumber}] Logistics tick failed:`, e); return null; }),
        this.finance.processFinancialTick(tickNumber)
          .catch(e => { console.error(`[Tick ${tickNumber}] Finance tick failed:`, e); return null; }),
        this.regulation.processRegulationTick(tickNumber)
          .catch(e => { console.error(`[Tick ${tickNumber}] Regulation tick failed:`, e); return null; }),
        this.energyMarket.processEnergyMarketTick(tickNumber)
          .catch(e => { console.error(`[Tick ${tickNumber}] EnergyMarket tick failed:`, e); return null; }),
        this.corpSecurity.processSecurityTick(tickNumber)
          .catch(e => { console.error(`[Tick ${tickNumber}] CorporateSecurity tick failed:`, e); return null; }),
        this.foreign.processTradeTick(tickNumber)
          .catch(e => { console.error(`[Tick ${tickNumber}] ForeignTrade tick failed:`, e); return null; }),
      ]);

    if (logisticsSummary) console.log(`[Tick ${tickNumber}] Logistics: ${logisticsSummary.arrivals} arrivals, ${logisticsSummary.spoilageEvents} spoilage, ${logisticsSummary.failedDeliveries} failed.`);
    if (financeSummary)  console.log(`[Tick ${tickNumber}] Finance: ${financeSummary.loanPaymentsCount} loans (₴${financeSummary.totalDeductedUah.toFixed(0)}), ${financeSummary.newInsolvencies} insolvencies, ${financeSummary.newBankruptcies} bankruptcies, ${financeSummary.recoveries} recoveries.`);
    if (regulationSummary) {
      console.log(`[Tick ${tickNumber}] Regulation: ${regulationSummary.auditsTriggered} audits, ${regulationSummary.licenseExpiries} expired, ${regulationSummary.enterprisesUnfrozen} unfrozen${regulationSummary.macroEvent.fired ? `, macro: ${regulationSummary.macroEvent.type}` : ''}.`);
      // Write regulation notifications
      const regNotifs: { playerId: string; type: string; title: string; body: string; entityId?: string }[] = [];
      for (const audit of regulationSummary.auditResults) {
        if (audit.type === 'FINE_ISSUED') {
          regNotifs.push({
            playerId: audit.playerId,
            type:     'AUDIT_FINE',
            title:    'Податкова перевірка — штраф',
            body:     `Штраф ₴${Number(audit.fineAmountUah).toLocaleString('uk-UA', { maximumFractionDigits: 0 })} за несплату ₴${Number(audit.evadedAmountUah).toLocaleString('uk-UA', { maximumFractionDigits: 0 })}. ${audit.frozenEnterpriseIds.length > 0 ? `${audit.frozenEnterpriseIds.length} підпр. заморожено.` : ''}`,
          });
        } else {
          regNotifs.push({
            playerId: audit.playerId,
            type:     'AUDIT_CLEAN',
            title:    'Податкова перевірка — чисто',
            body:     'Перевірка пройшла без порушень. Рейтинг відповідності підвищено.',
          });
        }
      }
      for (const ent of regulationSummary.unfrozenEnterprises) {
        regNotifs.push({
          playerId: ent.playerId,
          type:     'ENTERPRISE_UNFROZEN',
          title:    'Підприємство розморожено',
          body:     `"${ent.name}" більше не заморожено після перевірки.`,
          entityId: ent.id,
        });
      }
      if (regulationSummary.macroEvent.fired && regulationSummary.macroEvent.type) {
        const macroLabels: Record<string, { title: string; body: string }> = {
          POWER_OUTAGE:         { title: 'Відключення електрики', body: 'Аварійне відключення в регіоні. Підприємства сплачують надбавку за дизель протягом кількох тіків.' },
          LOGISTICS_BOTTLENECK: { title: 'Логістичні затримки',   body: 'Затор на маршруті. Поставки затримуються на 2 тіки.' },
          GRAIN_MARKET_BOOM:    { title: 'Зерновий бум',          body: 'Попит на зерно зріс. Агропідприємства отримують +35% до виручки протягом 5 тіків.' },
        };
        const label = macroLabels[regulationSummary.macroEvent.type] ?? { title: 'Макро-подія', body: regulationSummary.macroEvent.description ?? '' };
        const allPlayers = await this.db.player.findMany({ where: { isBankrupt: false }, select: { id: true } });
        for (const p of allPlayers) {
          regNotifs.push({ playerId: p.id, type: 'MACRO_EVENT', title: label.title, body: label.body });
        }
      }
      if (regNotifs.length > 0) {
        await this.db.notification.createMany({ data: regNotifs });
      }
    }
    if (energySummary)   console.log(`[Tick ${tickNumber}] EnergyMarket: ☀${energySummary.sunCoefficient.toFixed(3)} | solar ${energySummary.solarEnterprisesCount}ent | diesel ₴${energySummary.totalDieselCostUah.toFixed(0)} | saved ₴${energySummary.totalSolarSavingsUah.toFixed(0)}.`);
    if (securitySummary) console.log(`[Tick ${tickNumber}] CorpSecurity: ${securitySummary.systemsCharged} systems ₴${securitySummary.totalMaintenanceUah.toFixed(0)} | +${securitySummary.newFreezes} freezes | −${securitySummary.liftedFreezes} lifted.`);
    if (tradeSummary)    console.log(`[Tick ${tickNumber}] ForeignTrade: FX ₴${tradeSummary.fxRate.toFixed(4)}/$ | exports ${tradeSummary.exportsCleared} | imports ${tradeSummary.importsCleared} | storage ${tradeSummary.storageFeesCharged}.`);

    // ── 3e/3f. Fiscal + inflation (conditional, can run together) ──────────
    const [fiscalSummary, inflationResult] = await Promise.all([
      (tickNumber % TICKS_PER_SNAPSHOT === 0n)
        ? this.fiscal.collectTaxesAndAggregate(tickNumber).catch(e => { console.error(`[Tick ${tickNumber}] Fiscal aggregation failed:`, e); return null; })
        : Promise.resolve(null),
      (tickNumber % TICKS_PER_MONTH === 0n)
        ? this.fiscal.calculateInflationAndTariffIndex().catch(e => { console.error(`[Tick ${tickNumber}] Inflation calc failed:`, e); return null; })
        : Promise.resolve(null),
    ]);
    if (fiscalSummary)    console.log(`[Tick ${tickNumber}] Fiscal: +₴${fiscalSummary.newTotalUah.toFixed(0)} (ПДВ ₴${fiscalSummary.newVatUah.toFixed(0)} + OPEX ₴${fiscalSummary.newOpexTaxUah.toFixed(0)}), net ₴${fiscalSummary.budgetBalance.toFixed(0)}.`);
    if (inflationResult)  console.log(`[Tick ${tickNumber}] Inflation [${inflationResult.pressureCategory}]: tariff ${inflationResult.tariffDeltaPct >= 0 ? '+' : ''}${inflationResult.tariffDeltaPct.toFixed(1)}%, wage ${inflationResult.wageDeltaPct >= 0 ? '+' : ''}${inflationResult.wageDeltaPct.toFixed(1)}%.`);

    // ── 3j. Company valuation + 3k. Banking in parallel ──────────────────
    // Banking runs last to capture overdrafts from billing; valuation is independent.
    const [, bankingSummary, stockSummary] = await Promise.all([
      (tickNumber % TICKS_PER_SNAPSHOT === 0n)
        ? Promise.all(players.map(({ id: playerId }) =>
            this.valuation.calculateCompanyValuation(playerId).catch(e =>
              console.error(`[Tick ${tickNumber}] Valuation failed for ${playerId}:`, e),
            ),
          ))
        : Promise.resolve([]),
      // Banking captures all overdrafts from parallel billing above
      this.banking.processBankingTick(tickNumber).catch(e => { console.error(`[Tick ${tickNumber}] Banking tick failed:`, e); return null; }),
      this.stockExchange.processStockMarketTick(tickNumber).catch(e => { console.error(`[Tick ${tickNumber}] StockExchange tick failed:`, e); return null; }),
    ]);

    if (bankingSummary) {
      const msgs: string[] = [];
      if (bankingSummary.depositsMatured > 0)      msgs.push(`${bankingSummary.depositsMatured} dep matured (UAH ₴${bankingSummary.interestPaidUah.toFixed(0)} + USD $${bankingSummary.interestPaidUsd.toFixed(2)})`);
      if (bankingSummary.overdraftDrawdowns > 0)   msgs.push(`${bankingSummary.overdraftDrawdowns} OD draws ₴${bankingSummary.overdraftDrawnUah.toFixed(0)}`);
      if (bankingSummary.overdraftInterestUah.gt(0)) msgs.push(`OD interest ₴${bankingSummary.overdraftInterestUah.toFixed(2)}`);
      if (bankingSummary.limitBreachPlayers.length > 0) msgs.push(`LIMIT BREACH: ${bankingSummary.limitBreachPlayers.join(', ')}`);
      if (msgs.length > 0) console.log(`[Tick ${tickNumber}] Banking: ${msgs.join(' | ')}.`);
    }
    if (stockSummary && (stockSummary.totalTradesExecuted > 0 || stockSummary.npcCorrections > 0)) {
      console.log(`[Tick ${tickNumber}] StockExchange: ${stockSummary.tickersProcessed} tickers | ${stockSummary.totalTradesExecuted} trades ₴${stockSummary.totalVolumeUah.toFixed(0)} | ${stockSummary.npcCorrections} NPC corrections.`);
    }

    // ── 4. Collect overdue taxes — parallel per player ────────────────────
    await Promise.all(players.map(({ id: playerId }) =>
      this.tax.collectOverdueTaxes(playerId).catch(e =>
        console.error(`[Tick ${tickNumber}] Tax collection failed for ${playerId}:`, e),
      ),
    ));

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

    // ── c2. Auto-sell: place SELL orders for inventory exceeding threshold ─
    await this.processAutoSell(playerId).catch(e =>
      console.error(`[Tick ${tickNumber}] Auto-sell failed for ${playerId}:`, e)
    );

    // ── c3. Auto-replenish: place BUY orders when stock falls below min ────
    await this.processAutoReplenish(playerId).catch(e =>
      console.error(`[Tick ${tickNumber}] Auto-replenish failed for ${playerId}:`, e)
    );

    // ── d. Energy billing ────────────────────────────────────────────────
    await this.energy.calculateAndBillEnergy(playerId, tickNumber, utilisationByWorkshop);

    // ── e. Equipment degradation ─────────────────────────────────────────
    await this.equipment.processDegradation(playerId, utilisationByWorkshop);

    // ── f. HR tick ───────────────────────────────────────────────────────
    await this.hr.processTick(playerId, tickNumber, overworkedEnterpriseIds);

    // ── g. Перевірка прострочених кредитів (щотіково) ───────────────────
    await this.loans.checkOverdueLoans(playerId, tickNumber);

    // ── i. R&D — generate research points for RD_LABORATORY enterprises ──
    const rdResult = await this.rd.processResearchTick(playerId, tickNumber);
    if (rdResult.justUnlocked) {
      await this.db.notification.create({ data: {
        playerId,
        type:    'RESEARCH_COMPLETE',
        title:   'Дослідження завершено',
        body:    `Технологія "${rdResult.activeResearchCode}" успішно розроблена!`,
        entityId: null,
      }}).catch(() => {});
    }

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

    if (projects.length === 0) return;

    // Pre-fetch player balance ONCE — avoids N round-trips inside the loop.
    const playerData = await this.db.player.findUniqueOrThrow({
      where:  { id: playerId },
      select: { cashBalance: true },
    });
    let runningBalance = new Decimal(playerData.cashBalance.toString());

    for (const proj of projects) {
      const newRemaining = proj.ticksRemaining - 1;

      if (newRemaining <= 0) {
        await this.db.constructionProject.update({
          where: { id: proj.id },
          data:  { ticksRemaining: 0, status: 'COMPLETED', completedAt: new Date() },
        });

        await this.db.notification.create({
          data: {
            playerId: playerId,
            type:     "CONSTRUCTION_DONE",
            title:    "Будівництво завершено",
            body:     `"${proj.name}" на "${proj.enterprise.name}" введено в експлуатацію.`,
            entityId: proj.enterpriseId,
          },
        });

        if (proj.targetType === 'ENTERPRISE') {
          await this.db.enterprise.update({
            where: { id: proj.targetId },
            data:  { isOperational: true, constructedAt: new Date() },
          });
          const ent = await this.db.enterprise.findUnique({ where: { id: proj.targetId } });
          if (ent?.type === 'OFFICE') {
            await this.db.office.updateMany({
              where: { enterpriseId: proj.targetId },
              data:  { isOperational: true },
            });
          }
        } else if (proj.targetType === 'WORKSHOP') {
          await this.db.workshop.update({ where: { id: proj.targetId }, data: { isActive: true } });
          await this.db.enterprise.update({
            where: { id: proj.enterpriseId },
            data:  { usedFloorAreaM2: { increment: proj.footprintM2 } },
          });
        }
      } else {
        const dailyCost = new Decimal(proj.totalCostUah.toString()).dividedBy(proj.ticksRequired);
        const before    = runningBalance;
        const after     = before.minus(dailyCost);
        runningBalance  = after; // track running balance to avoid re-fetching

        await this.db.$transaction([
          this.db.player.update({
            where: { id: playerId },
            data:  { cashBalance: after },      // absolute value — safe because we track locally
          }),
          this.db.constructionProject.update({
            where: { id: proj.id },
            data:  { ticksRemaining: newRemaining, paidCostUah: { increment: dailyCost } },
          }),
          this.db.financialTransaction.create({
            data: {
              playerId,
              type:          'CONSTRUCTION_COST',
              amountUah:     dailyCost.negated(),
              balanceBefore: before,
              balanceAfter:  after,
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
      where:  { isCompleted: false },
      select: { id: true, employeeId: true, targetLevel: true, ticksRemaining: true },
    });
    if (sessions.length === 0) return;

    const completing = sessions.filter((s) => s.ticksRemaining <= 1);
    const ongoing    = sessions.filter((s) => s.ticksRemaining > 1);

    // Bulk decrement ongoing sessions with one raw UPDATE
    if (ongoing.length > 0) {
      const ids = ongoing.map((s) => s.id);
      await this.db.$executeRaw`
        UPDATE "TrainingSession"
        SET "ticksRemaining" = "ticksRemaining" - 1
        WHERE id = ANY(${ids}::uuid[])
      `;
    }

    // Complete finishing sessions individually (small set)
    const BONUS: Record<number, number> = { 1: 0.05, 2: 0.10, 3: 0.15, 4: 0.20, 5: 0.25 };
    for (const s of completing) {
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
            baseEfficiency:     { increment: bonus },
            efficiency:         { increment: bonus },
          },
        }),
      ]);
    }
  }

  private async processSupplyRoutes(): Promise<number> {
    const routes = await this.db.supplyRoute.findMany({
      where:  { isActive: true },
      select: { id: true, sourceEnterpriseId: true, targetEnterpriseId: true, productId: true, qtyPerTick: true },
    });
    if (routes.length === 0) return 0;

    // Batch-fetch all required source inventories in ONE query instead of N findUnique calls
    const srcInventories = await this.db.enterpriseInventory.findMany({
      where: {
        OR: routes.map((r) => ({ enterpriseId: r.sourceEnterpriseId, productId: r.productId })),
      },
      select: { enterpriseId: true, productId: true, quantity: true, avgQuality: true },
    });
    const invMap = new Map(
      srcInventories.map((inv) => [`${inv.enterpriseId}:${inv.productId}`, inv]),
    );

    let transfers = 0;
    for (const route of routes) {
      const srcInv = invMap.get(`${route.sourceEnterpriseId}:${route.productId}`);
      if (!srcInv || Number(srcInv.quantity) < route.qtyPerTick) continue;

      const qty     = route.qtyPerTick;
      const quality = Number(srcInv.avgQuality);

      await this.db.$transaction([
        this.db.enterpriseInventory.update({
          where: { enterpriseId_productId: { enterpriseId: route.sourceEnterpriseId, productId: route.productId } },
          data:  { quantity: { decrement: qty } },
        }),
        this.db.enterpriseInventory.upsert({
          where:  { enterpriseId_productId: { enterpriseId: route.targetEnterpriseId, productId: route.productId } },
          create: { enterpriseId: route.targetEnterpriseId, productId: route.productId, quantity: qty, avgQuality: quality },
          update: { quantity: { increment: qty } },
        }),
      ]);

      // Update local map so same-tick checks are accurate
      const newQty = Number(srcInv.quantity) - qty;
      srcInv.quantity = newQty as unknown as typeof srcInv.quantity;
      transfers++;
    }
    return transfers;
  }

  private async processAutoReplenish(playerId: string): Promise<void> {
    const rules = await this.db.replenishRule.findMany({
      where: { playerId, isActive: true },
      select: {
        id: true, enterpriseId: true, productId: true,
        minStockTicks: true, maxPricePerUnit: true,
        product: { select: { sku: true } },
      },
    });
    if (rules.length === 0) return;

    // Batch-fetch inventories and workshops in one pass
    const enterpriseIds = [...new Set(rules.map(r => r.enterpriseId))];
    const productIds    = [...new Set(rules.map(r => r.productId))];

    const [inventories, workshops, openBuyOrders] = await Promise.all([
      this.db.enterpriseInventory.findMany({
        where: { enterpriseId: { in: enterpriseIds }, productId: { in: productIds } },
        select: { enterpriseId: true, productId: true, quantity: true },
      }),
      this.db.workshop.findMany({
        where: { enterpriseId: { in: enterpriseIds }, isActive: true },
        select: {
          enterpriseId: true, maxCapacity: true,
          productionOrders: {
            where: { status: "IN_PROGRESS" },
            select: {
              recipe: {
                select: {
                  inputs: { select: { productId: true, quantityPerUnit: true } },
                },
              },
            },
          },
        },
      }),
      this.db.marketOrder.findMany({
        where: { playerId, type: "BUY", status: { in: ["OPEN", "PARTIALLY_FILLED"] }, productId: { in: productIds } },
        select: { productId: true },
      }),
    ]);

    const invMap = new Map(inventories.map(i => [`${i.enterpriseId}:${i.productId}`, Number(i.quantity)]));
    const openBuySet = new Set(openBuyOrders.map(o => o.productId));

    for (const rule of rules) {
      // Skip if open BUY order already exists for this product
      if (openBuySet.has(rule.productId)) continue;

      const currentQty = invMap.get(`${rule.enterpriseId}:${rule.productId}`) ?? 0;

      // Estimate consumption per tick from active workshops at this enterprise
      const entWorkshops = workshops.filter(w => w.enterpriseId === rule.enterpriseId);
      let consumptionPerTick = 0;
      for (const ws of entWorkshops) {
        for (const order of ws.productionOrders) {
          for (const input of order.recipe.inputs) {
            if (input.productId === rule.productId) {
              consumptionPerTick += input.quantityPerUnit * ws.maxCapacity;
            }
          }
        }
      }
      // Fallback: if no active production found, use a minimal default (10/tick)
      if (consumptionPerTick === 0) consumptionPerTick = 10;

      const desiredQty = rule.minStockTicks * consumptionPerTick;
      if (currentQty >= desiredQty) continue;

      const buyQty = Math.ceil(desiredQty - currentQty);
      const maxPrice = Number(rule.maxPricePerUnit);

      // Check if any SELL offers exist at or below maxPrice
      const cheapestSell = await this.db.marketOrder.findFirst({
        where: {
          productId: rule.productId,
          type:      "SELL",
          status:    { in: ["OPEN", "PARTIALLY_FILLED"] },
          pricePerUnit: { lte: maxPrice },
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      });
      if (!cheapestSell) continue; // no supply at acceptable price

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 3);

      await Promise.all([
        this.db.marketOrder.create({
          data: {
            playerId,
            productId:      rule.productId,
            resourceType:   rule.product.sku,
            type:           "BUY",
            status:         "OPEN",
            pricePerUnit:   maxPrice,
            qualityMin:     0,
            quantityTotal:  buyQty,
            quantityFilled: 0,
            expiresAt,
          },
        }),
        this.db.replenishRule.update({
          where: { id: rule.id },
          data:  { lastTriggeredAt: new Date() },
        }),
      ]);

      openBuySet.add(rule.productId); // prevent duplicate orders in same tick
    }
  }

  private async processAutoSell(playerId: string): Promise<void> {
    const items = await this.db.enterpriseInventory.findMany({
      where: {
        enterprise: { playerId },
        autoSellThreshold: { gt: 0 },
        autoSellPriceUah:  { not: null },
      },
      select: {
        enterpriseId: true, productId: true,
        quantity: true, avgQuality: true,
        autoSellThreshold: true, autoSellPriceUah: true,
        product: { select: { sku: true, nameUa: true } },
      },
    });

    for (const item of items) {
      const qty       = Number(item.quantity);
      const threshold = item.autoSellThreshold;
      if (qty <= threshold) continue;

      const sellQty = qty - threshold;
      const price   = Number(item.autoSellPriceUah!);

      // Check for an existing OPEN auto-sell order for same product+player to avoid duplicates
      const existing = await this.db.marketOrder.findFirst({
        where: {
          playerId, productId: item.productId,
          type: "SELL", status: "OPEN",
        },
        select: { id: true },
      });
      if (existing) continue;

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 3);

      await this.db.$transaction([
        this.db.enterpriseInventory.update({
          where: { enterpriseId_productId: { enterpriseId: item.enterpriseId, productId: item.productId } },
          data:  { quantity: { decrement: sellQty } },
        }),
        this.db.marketOrder.create({
          data: {
            playerId,
            productId:     item.productId,
            resourceType:  item.product.sku,
            type:          "SELL",
            status:        "OPEN",
            pricePerUnit:  price,
            quality:       Number(item.avgQuality),
            quantityTotal: sellQty,
            quantityFilled: 0,
            expiresAt,
          },
        }),
      ]);
    }
  }
}
