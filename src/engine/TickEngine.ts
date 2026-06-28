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
import { TenderService }             from './TenderService';
import { RatingService }             from './RatingService';
import { SyndicateVoteService }      from './SyndicateVoteService';
import { WarehouseRentalService }    from './WarehouseRentalService';
import { NpcCompetitorService }          from './NpcCompetitorService';
import { AgroService }                   from './AgroService';
import { CreditScoreService }            from './CreditScoreService';
import { LogisticsFreightService }       from './LogisticsFreightService';
import { B2bTransferService }            from './B2bTransferService';
import { RegulatoryInspectionService }   from './RegulatoryInspectionService';
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
  private readonly tenders:        TenderService;
  private readonly ratings:        RatingService;
  private readonly syndicateVotes:   SyndicateVoteService;
  private readonly warehouseRents:   WarehouseRentalService;
  private readonly npcCompetitors:   NpcCompetitorService;
  private readonly agro:             AgroService;
  private readonly creditScore:      CreditScoreService;
  private readonly freightSvc:       LogisticsFreightService;
  private readonly b2bTransfer:      B2bTransferService;
  private readonly inspections:      RegulatoryInspectionService;
  private readonly db:               PrismaClient;

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
    this.stockExchange  = new StockExchangeService(prismaClient);
    this.tenders        = new TenderService(prismaClient);
    this.ratings        = new RatingService(prismaClient);
    this.syndicateVotes  = new SyndicateVoteService(prismaClient);
    this.warehouseRents  = new WarehouseRentalService(prismaClient);
    this.npcCompetitors  = new NpcCompetitorService(prismaClient);
    this.agro            = new AgroService(prismaClient);
    this.creditScore     = new CreditScoreService(prismaClient);
    this.freightSvc      = new LogisticsFreightService(prismaClient);
    this.b2bTransfer     = new B2bTransferService(prismaClient);
    this.inspections     = new RegulatoryInspectionService(prismaClient);
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
    const T = (label: string) => console.log(`[Tick ${tickNumber}] ⏱ ${label}: ${Date.now() - tickStart}ms`);
    const tickStart = Date.now();

    // ── 1. Expire stale orders ───────────────────────────────────────────
    const ordersExpired = await this.market.expireStaleOrders();
    T('expireStaleOrders');

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
    T('playerTicks');

    // ── 2b-2d. Незалежні глобальні операції — паралельно ────────────────
    const [retailSummary, supplyTransfers] = await Promise.all([
      this.market.processAllNpcSales(tickNumber)
        .catch(e => { console.error(`[Tick ${tickNumber}] Retail NPC sales failed:`, e); return null; }),
      this.processSupplyRoutes()
        .catch(e => { console.error(`[Tick ${tickNumber}] Supply routes failed:`, e); return 0; }),
      this.processTrainingSessions()
        .catch(e => console.error(`[Tick ${tickNumber}] Training sessions failed:`, e)),
      this.processLivestock(tickNumber)
        .catch(e => console.error(`[Tick ${tickNumber}] Livestock failed:`, e)),
      this.processMachineryWear(tickNumber)
        .catch(e => console.error(`[Tick ${tickNumber}] Machinery wear failed:`, e)),
      this.syndicateVotes.processExpiredVotes(tickNumber)
        .catch(e => console.error(`[Tick ${tickNumber}] Syndicate votes failed:`, e)),
      this.warehouseRents.processRentals(tickNumber)
        .catch(e => console.error(`[Tick ${tickNumber}] Warehouse rentals failed:`, e)),
      this.db.retailListing.updateMany({
        where: { promotionActive: true, promotionEndTick: { lte: tickNumber } },
        data:  { promotionActive: false, promotionEndTick: null },
      }).catch(e => console.error(`[Tick ${tickNumber}] Promo expiry failed:`, e)),
      // AGRO: погода, ф'ючерси, якість зерна — незалежні між собою
      this.agro.processLocalWeather(tickNumber)
        .catch(e => console.error(`[Tick ${tickNumber}] Agro weather failed:`, e)),
      this.agro.processForwardContracts(tickNumber)
        .catch(e => console.error(`[Tick ${tickNumber}] Forward contracts failed:`, e)),
      this.agro.processGrainQualityDegradation()
        .catch(e => console.error(`[Tick ${tickNumber}] Grain quality degradation failed:`, e)),
    ]);
    if (retailSummary && retailSummary.totalSold > 0) {
      console.log(`[Tick ${tickNumber}] Retail: ${retailSummary.totalSold.toFixed(0)} od. sold, ₴${retailSummary.totalRevenue.toFixed(0)} revenue.`);
    }
    if (supplyTransfers > 0) {
      console.log(`[Tick ${tickNumber}] Supply routes: ${supplyTransfers} transfers executed.`);
    }

    // ── Активація нових цехів ─────────────────────────────────────────────
    const newWorkshops = await this.db.workshop.findMany({
      where: { isActive: false, activatesAtTick: { lte: tickNumber } },
      select: { id: true, enterprise: { select: { playerId: true, name: true } }, name: true },
    });
    if (newWorkshops.length > 0) {
      await this.db.workshop.updateMany({ where: { id: { in: newWorkshops.map(w => w.id) } }, data: { isActive: true } });
      await this.db.notification.createMany({
        data: newWorkshops.map(w => ({
          playerId: w.enterprise.playerId, type: 'CONSTRUCTION_COMPLETE',
          title: 'Розширення завершено', body: `Новий цех "${w.name}" у "${w.enterprise.name}" введено в експлуатацію.`,
        })),
      }).catch(() => {});
    }

    // ── Умовні операції (кожні N тіків) — паралельно ─────────────────────
    await Promise.all([
      Number(tickNumber) % 5  === 0 ? this.market.replenishDerzhprom()
        .catch(e => console.error(`[Tick ${tickNumber}] ДержПром replenish failed:`, e)) : Promise.resolve(),
      Number(tickNumber) % 3  === 0 ? this.npcCompetitors.ensureBotsExist()
        .then(() => this.npcCompetitors.tick(tickNumber))
        .catch(e => console.error(`[Tick ${tickNumber}] NPC competitors failed:`, e)) : Promise.resolve(),
      Number(tickNumber) % 30 === 0 ? this.ratings.processAwards(tickNumber)
        .then(n => n > 0 && console.log(`[Tick ${tickNumber}] Рейтинги: ${n} нагород.`))
        .catch(e => console.error(`[Tick ${tickNumber}] Ratings failed:`, e)) : Promise.resolve(),
      this.tenders.expireTenders(tickNumber)
        .catch(e => console.error(`[Tick ${tickNumber}] Tender expiry failed:`, e)),
    ]);
    if (Number(tickNumber) % 15 === 0) {
      const newTenders = await this.tenders.generateTenders(tickNumber)
        .catch(e => { console.error(`[Tick ${tickNumber}] Tender generation failed:`, e); return 0; });
      if (newTenders > 0) console.log(`[Tick ${tickNumber}] Тендери: ${newTenders} нових.`);
    }
    if (Number(tickNumber) % 30 === 0) {
      const subsidyCount = await this.agro.payAgroSubsidies(tickNumber)
        .catch(e => { console.error(`[Tick ${tickNumber}] Agro subsidies failed:`, e); return 0; });
      if (subsidyCount > 0) console.log(`[Tick ${tickNumber}] Агро-субсидії: ${subsidyCount} фермерів.`);
      await this.agro.chargeExtraFieldRents(tickNumber)
        .catch(e => console.error(`[Tick ${tickNumber}] Extra field rent failed:`, e));
      await this.agro.processSeasonalSoilAndPests(tickNumber)
        .catch(e => console.error(`[Tick ${tickNumber}] Seasonal soil/pests failed:`, e));
    }

    // ── 3a1j. B2B трансфер, логіст. замовлення, інспекції — паралельно ──
    await Promise.all([
      this.b2bTransfer.processTransfers(tickNumber)
        .catch(e => console.error(`[Tick ${tickNumber}] B2B transfer failed:`, e)),
      this.freightSvc.processCompletedOrders(tickNumber)
        .catch(e => console.error(`[Tick ${tickNumber}] Freight orders failed:`, e)),
      this.inspections.processInspections(tickNumber)
        .catch(e => console.error(`[Tick ${tickNumber}] Regulatory inspections failed:`, e)),
      Number(tickNumber) % 5 === 0
        ? this.freightSvc.generateNpcOrders(tickNumber).catch(e => console.error(`[Tick ${tickNumber}] Freight NPC orders failed:`, e))
        : Promise.resolve(),
    ]);

    // ── 3a1b. Держзамовлення — нові BUY-ордери з премією кожні 8 тіків ──
    // Виконується ДО matchOrders щоб нові ордери одразу потрапляли в матчинг
    if (Number(tickNumber) % 8 === 0) {
      const count = await this.market.generateStateOrders()
        .catch(e => { console.error(`[Tick ${tickNumber}] State orders failed:`, e); return 0; });
      if (count > 0) console.log(`[Tick ${tickNumber}] Держзамовлення: ${count} нових ордерів.`);

      const npcSells = await this.market.generateNpcSellOrders()
        .catch(e => { console.error(`[Tick ${tickNumber}] NPC sell orders failed:`, e); return 0; });
      if (npcSells > 0) console.log(`[Tick ${tickNumber}] NPC продаж: ${npcSells} ордерів.`);

      await this.market.processPriceAlerts()
        .catch(e => console.error(`[Tick ${tickNumber}] Price alerts failed:`, e));
    }

    T('globalParallelOps + b2b + market orders');
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

    T('matchOrders');
    // ── 3a2. NPC market buying — скуповує SELL-ордери до referencePrice ──
    const npcMarketUnits = await this.market.matchNpcMarketOrders(tickNumber)
      .catch(e => { console.error(`[Tick ${tickNumber}] NPC market buy failed:`, e); return 0; });
    if (npcMarketUnits > 0) {
      console.log(`[Tick ${tickNumber}] NPC market: bought ${npcMarketUnits.toFixed(0)} units.`);
    }

    T('matchNpcMarketOrders');
    // ── 3a3. Dynamic NPC price update — реагує на supply/demand поточного тіку ──
    await this.market.updateNpcMarketPrices()
      .catch(e => console.error(`[Tick ${tickNumber}] NPC price update failed:`, e));

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
          DROUGHT:              { title: 'Посуха',                 body: 'Посуха у регіоні. AGRO_FARM-підприємства виробляють −60% від норми протягом 8 тіків.' },
          PEST_ATTACK:          { title: 'Нашестя шкідників',     body: 'Шкідники атакують AGRO_FARM. Тримайте RM-PESTICIDE для захисту врожаю.' },
          CURRENCY_SHOCK:       { title: 'Девальвація гривні',    body: 'НБУ утримує курс — NPC купує дорожче ×1.20, але попит −10% на 10 тіків. Підвищуйте ціни та використовуйте момент!' },
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
      await this.production.processProduction(playerId, tickNumber);

    // ── c. NPC retail sales — handled globally after player loop ────────

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
    const degradationResults = await this.equipment.processDegradation(playerId, utilisationByWorkshop);
    {
      const newlyBroken = degradationResults.filter(r => r.statusBefore !== 'BROKEN' && r.statusAfter === 'BROKEN');
      const newlyWorn   = degradationResults.filter(r => r.statusBefore === 'NEW' && r.statusAfter === 'WORN');
      const equipNotifs: { playerId: string; type: string; title: string; body: string; entityId: string | null }[] = [];
      if (newlyBroken.length > 0) {
        equipNotifs.push({
          playerId, type: 'EQUIPMENT_BROKEN',
          title: 'Обладнання зламалось',
          body:  `${newlyBroken.length} од. обладнання вийшло з ладу. Потрібен аварійний ремонт.`,
          entityId: null,
        });
      }
      if (newlyWorn.length > 0) {
        equipNotifs.push({
          playerId, type: 'EQUIPMENT_WORN',
          title: 'Обладнання зношується',
          body:  `${newlyWorn.length} од. обладнання у стані "Зношено". Проведіть техобслуговування.`,
          entityId: null,
        });
      }
      if (equipNotifs.length > 0) {
        await this.db.notification.createMany({ data: equipNotifs }).catch(() => {});
      }
    }

    // ── f. HR tick ───────────────────────────────────────────────────────
    const hrResults = await this.hr.processTick(playerId, tickNumber, overworkedEnterpriseIds);
    const strikers  = hrResults.filter(r => r.wentOnStrike);
    const resolved  = hrResults.filter(r => r.strikeResolved);
    if (strikers.length > 0) {
      await this.db.notification.create({ data: {
        playerId,
        type:    'STRIKE',
        title:   'Страйк на підприємстві',
        body:    `${strikers.length} ${strikers.length === 1 ? 'працівник оголосив' : 'працівників оголосили'} страйк. Перевірте рівень зарплат та настрій.`,
        entityId: null,
      }}).catch(() => {});
    }
    if (resolved.length > 0) {
      await this.db.notification.create({ data: {
        playerId,
        type:    'STRIKE_RESOLVED',
        title:   'Страйк завершено',
        body:    `${resolved.length} ${resolved.length === 1 ? 'працівник вийшов' : 'працівників вийшли'} з страйку. Виробництво відновлено.`,
        entityId: null,
      }}).catch(() => {});
    }

    // ── g. Перевірка прострочених кредитів (щотіково) ───────────────────
    await this.loans.checkOverdueLoans(playerId, tickNumber);

    // ── g2. Credit score passive growth ─────────────────────────────────
    await this.creditScore.tickPassiveGrowth(playerId)
      .catch(e => console.error(`[Tick ${tickNumber}] CreditScore failed for ${playerId}:`, e));

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
      const emp = await this.db.employee.findUnique({
        where:  { id: s.employeeId },
        select: { firstName: true, lastName: true, playerId: true },
      });
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
      if (emp?.playerId) {
        await this.db.notification.create({ data: {
          playerId: emp.playerId,
          type:     'TRAINING_COMPLETE',
          title:    'Навчання завершено',
          body:     `${emp.firstName} ${emp.lastName} підвищив кваліфікацію до рівня ${s.targetLevel}. Ефективність +${(bonus * 100).toFixed(0)}%.`,
          entityId: s.employeeId,
        }}).catch(() => {});
      }
    }
  }

  private async processSupplyRoutes(): Promise<number> {
    const routes = await this.db.supplyRoute.findMany({
      where:  { isActive: true },
      select: { id: true, sourceEnterpriseId: true, targetEnterpriseId: true, productId: true, qtyPerTick: true,
                sourceEnterprise: { select: { playerId: true } },
                targetEnterprise: { select: { type: true, totalFloorAreaM2: true } } },
    });
    if (routes.length === 0) return 0;

    // LOGISTICS_HUB: players who own one get +50% throughput on their supply routes
    const logisticsPlayerIds = new Set(
      (await this.db.enterprise.findMany({
        where:  { type: 'LOGISTICS_HUB', isOperational: true },
        select: { playerId: true },
      })).map(e => e.playerId)
    );

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

    // Для RETAIL_STORE — ємність 100 кг/м²; потрібні ваги продуктів
    const retailTargetIds = new Set(
      routes.filter(r => r.targetEnterprise.type === 'RETAIL_STORE').map(r => r.targetEnterpriseId)
    );
    const productIds = [...new Set(routes.map(r => r.productId))];
    const productWeights = retailTargetIds.size > 0
      ? await this.db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, baseWeightKg: true } })
      : [];
    const weightMap = new Map(productWeights.map(p => [p.id, p.baseWeightKg ?? 1]));

    // Поточне завантаження кожного retail-магазину (кг)
    const retailCurrentKgMap = new Map<string, number>();
    if (retailTargetIds.size > 0) {
      const allRetailInv = await this.db.enterpriseInventory.findMany({
        where: { enterpriseId: { in: [...retailTargetIds] } },
        select: { enterpriseId: true, productId: true, quantity: true,
                  product: { select: { baseWeightKg: true } } },
      });
      for (const inv of allRetailInv) {
        const kg = Number(inv.quantity) * (inv.product.baseWeightKg ?? 1);
        retailCurrentKgMap.set(inv.enterpriseId, (retailCurrentKgMap.get(inv.enterpriseId) ?? 0) + kg);
      }
    }

    let transfers = 0;
    for (const route of routes) {
      const srcInv = invMap.get(`${route.sourceEnterpriseId}:${route.productId}`);
      const hubBonus = logisticsPlayerIds.has(route.sourceEnterprise.playerId) ? 1.5 : 1.0;
      let qty        = route.qtyPerTick * hubBonus;
      if (!srcInv || Number(srcInv.quantity) < qty) continue;
      const quality = Number(srcInv.avgQuality);

      // ── Перевірка ємності RETAIL_STORE ──────────────────────────────────
      if (route.targetEnterprise.type === 'RETAIL_STORE') {
        const capacityKg  = route.targetEnterprise.totalFloorAreaM2 * 100;
        const usedKg      = retailCurrentKgMap.get(route.targetEnterpriseId) ?? 0;
        const remainingKg = capacityKg - usedKg;
        const kgPerUnit   = weightMap.get(route.productId) ?? 1;
        const maxUnits    = Math.floor(remainingKg / kgPerUnit);
        if (maxUnits <= 0) continue; // магазин переповнений
        qty = Math.min(qty, maxUnits);
        // Оновити поточне завантаження для наступних маршрутів того ж магазину
        retailCurrentKgMap.set(route.targetEnterpriseId, usedKg + qty * kgPerUnit);
      }

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
        // Remove from enterprise inventory
        this.db.enterpriseInventory.update({
          where: { enterpriseId_productId: { enterpriseId: item.enterpriseId, productId: item.productId } },
          data:  { quantity: { decrement: sellQty } },
        }),
        // Escrow in player inventory (matchOrders checks here)
        this.db.playerInventory.upsert({
          where:  { playerId_productId: { playerId, productId: item.productId } },
          update: { quantity: { increment: sellQty } },
          create: { playerId, productId: item.productId, quantity: sellQty, avgQuality: Number(item.avgQuality) },
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

    // Re-list goods stuck in playerInventory with no active sell order
    // (happens when orders are cancelled externally, e.g. by compliance)
    const playerInvItems = await this.db.playerInventory.findMany({
      where: { playerId, quantity: { gt: 1 } },
      select: { productId: true, quantity: true, avgQuality: true,
                product: { select: { sku: true } } },
    });

    for (const pItem of playerInvItems) {
      const openOrder = await this.db.marketOrder.findFirst({
        where: { playerId, productId: pItem.productId, type: 'SELL', status: { in: ['OPEN', 'PARTIALLY_FILLED'] } },
        select: { id: true },
      });
      if (openOrder) continue;

      // Look up auto-sell price from enterprise inventory config
      const entInv = await this.db.enterpriseInventory.findFirst({
        where: { enterprise: { playerId }, productId: pItem.productId, autoSellPriceUah: { not: null } },
        select: { autoSellPriceUah: true },
      });
      if (!entInv?.autoSellPriceUah) continue;

      const qty   = Number(pItem.quantity);
      const price = Number(entInv.autoSellPriceUah);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 3);

      await this.db.marketOrder.create({
        data: {
          playerId,
          productId:     pItem.productId,
          resourceType:  pItem.product.sku,
          type:          'SELL',
          status:        'OPEN',
          pricePerUnit:  price,
          quality:       Number(pItem.avgQuality),
          quantityTotal: qty,
          quantityFilled: 0,
          expiresAt,
        },
      });
    }
  }

  // ── Livestock processing ──────────────────────────────────────────────────
  private async processLivestock(tickNumber: bigint): Promise<void> {
    const herds = await this.db.livestockHerd.findMany({
      include: {
        enterprise: {
          select: { id: true, playerId: true, isOperational: true },
          include: { employees: { select: { profession: true } } },
        },
      },
    });

    const FEED_SKU   = 'RM-CORN';
    const feedProduct = await this.db.product.findUnique({ where: { sku: FEED_SKU }, select: { id: true } });
    if (!feedProduct) return;

    const OUTPUT: Record<string, { sku: string; qtyPerHead: number }> = {
      CATTLE:  { sku: 'SF-MILK',  qtyPerHead: 10  },
      POULTRY: { sku: 'FG-EGGS',  qtyPerHead: 0.5 },
    };
    const FEED_QTY: Record<string, number> = { CATTLE: 0.05, PIGS: 0.03, POULTRY: 0.01 };

    for (const herd of herds) {
      if (!herd.enterprise.isOperational) continue;
      const eid = herd.enterprise.id;

      // Check feed availability
      const feedInv = await this.db.enterpriseInventory.findUnique({
        where:  { enterpriseId_productId: { enterpriseId: eid, productId: feedProduct.id } },
        select: { quantity: true },
      });
      const feedNeeded = (FEED_QTY[herd.species] ?? 0.03) * herd.headCount;
      const hasFeed    = feedInv && Number(feedInv.quantity) >= feedNeeded;

      if (hasFeed) {
        // Consume feed
        await this.db.enterpriseInventory.updateMany({
          where: { enterpriseId: eid, productId: feedProduct.id },
          data:  { quantity: { decrement: feedNeeded } },
        });
        // VETERINARIAN: +5% health recovery per vet (max 2)
        const vets = (herd.enterprise as unknown as { employees?: { profession: string }[] }).employees
          ?.filter(e => e.profession === 'VETERINARIAN').length ?? 0;
        const vetBonus = Math.min(vets, 2) * 0.05;

        // Restore health if needed
        if (herd.health < 1.0) {
          await this.db.livestockHerd.update({ where: { id: herd.id }, data: { health: Math.min(1.0, herd.health + 0.05 + vetBonus), feedSkippedTicks: 0, ageInTicks: herd.ageInTicks + 1 } });
        } else {
          await this.db.livestockHerd.update({ where: { id: herd.id }, data: { ageInTicks: herd.ageInTicks + 1, feedSkippedTicks: 0 } });
        }

        // Produce output (CATTLE → milk, POULTRY → eggs)
        const out = OUTPUT[herd.species];
        if (out && herd.health >= 0.5) {
          const outProduct = await this.db.product.findUnique({ where: { sku: out.sku }, select: { id: true } });
          if (outProduct) {
            const qty = out.qtyPerHead * herd.headCount * herd.health;
            await this.db.enterpriseInventory.upsert({
              where:  { enterpriseId_productId: { enterpriseId: eid, productId: outProduct.id } },
              update: { quantity: { increment: qty } },
              create: { enterpriseId: eid, productId: outProduct.id, quantity: qty },
            });
          }
        }
      } else {
        // No feed: health decreases
        const skipped = herd.feedSkippedTicks + 1;
        const newHealth = Math.max(0.1, herd.health - 0.05 * skipped);
        await this.db.livestockHerd.update({ where: { id: herd.id }, data: { health: newHealth, feedSkippedTicks: skipped } });

        if (skipped === 3) {
          await this.db.notification.create({ data: {
            playerId: herd.enterprise.playerId, type: 'MACRO_EVENT',
            title:    '⚠ Тварини голодують',
            body:     `Стадо (${herd.species}) 3 тіки без корму. Здоров'я: ${Math.round(newHealth * 100)}%. Поповніть RM-CORN.`,
          } }).catch(() => {});
        }
      }
    }
  }

  // ── Machinery wear ─────────────────────────────────────────────────────────
  private async processMachineryWear(_tickNumber: bigint): Promise<void> {
    const allMachinery = await this.db.farmMachinery.findMany({
      where: { isOperational: true },
    });

    for (const m of allMachinery) {
      const wear = m.isRented ? 0.008 : 0.005; // орендована зношується швидше
      const newDurability = Math.max(0, m.durability - wear);
      const broke = newDurability <= 0;

      await this.db.farmMachinery.update({
        where: { id: m.id },
        data:  { durability: newDurability, isOperational: !broke },
      });

      if (broke) {
        await this.db.notification.create({ data: {
          playerId: m.playerId, type: 'MACRO_EVENT',
          title:    `🔧 ${m.name} зламалась`,
          body:     `${m.name} повністю зношена і потребує ремонту. Без неї врожайність знижена.`,
        } }).catch(() => {});
      }
    }
  }
}
