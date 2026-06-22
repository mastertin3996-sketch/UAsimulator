/**
 * AnalyticsService — BI layer: KPI computation, time-series aggregation,
 * regional cost breakdown, and supply-chain efficiency reporting.
 *
 * Data flow:
 *   ProductionService → AnalyticsService.recordProductionResults() → ProductionLog
 *   TickEngine (every 24 ticks) → populateDailySnapshot() → DailySnapshot
 *   Frontend → getXxx() → JSON ready for Recharts / Chart.js
 *
 * Performance strategy:
 *   • DailySnapshot is pre-aggregated; WEEK time-series = O(snapshots) only.
 *   • ProductionLog has composite indexes on (playerId, tickNumber) so KPI
 *     look-back queries hit the index without full scans.
 *   • EnergyBill, FinancialLog are already indexed on (playerId, tickNumber).
 *   • Heavy aggregations use Prisma groupBy() or $queryRaw — never N+1.
 *   • createMany() for batch ProductionLog writes (one round-trip per tick).
 */

import { PrismaClient }  from '@prisma/client';
import { Decimal }       from '@prisma/client/runtime/library';
import type { ProductionResult } from '../types';
import { TICKS_PER_SNAPSHOT }   from '../constants/economic';

// ── FinancialLog category sets ────────────────────────────────────────────────

const REVENUE_CATS  = new Set(['REVENUE_RETAIL', 'REVENUE_B2B']);
const OPEX_CATS     = new Set(['EXPENSE_ENERGY', 'EXPENSE_SALARY', 'EXPENSE_ESV', 'EXPENSE_LOGISTICS']);
const ALL_OPEX_CATS = new Set([
  'EXPENSE_SALARY', 'EXPENSE_ESV', 'EXPENSE_TAX', 'EXPENSE_ENERGY',
  'EXPENSE_LOGISTICS', 'EXPENSE_LEASE', 'EXPENSE_INTEREST',
  'EXPENSE_MAINTENANCE', 'EXPENSE_DEPRECIATION',
]);
const TAX_CATS = new Set(['EXPENSE_TAX']);

const ZERO = new Decimal(0);

// ── Return types ──────────────────────────────────────────────────────────────

export interface CompanyKPIs {
  playerId:              string;
  daysLookback:          number;
  // Core ratios
  roiPct:                number | null;  // Net Profit / Total Investment × 100
  opexToRevenue:         number | null;  // OPEX / Revenue (null if no revenue)
  laborProductivityIndex: number | null; // units / (salary spend / 1 000)
  // Raw inputs for transparency
  netProfitUah:          number;
  totalInvestmentUah:    number;
  revenueUah:            number;
  opexUah:               number;
  taxPaidUah:            number;
  unitsProducedInPeriod: number;
  salarySpendUah:        number;
}

export interface FinancialPeriod {
  periodLabel: string;  // "Day 42" | "Week 3"
  revenue:     number;
  opex:        number;
  taxes:       number;
  netProfit:   number;
}

export interface RegionalCostEntry {
  cityId:     string;
  cityName:   string;
  cityNameUa: string;
  energyUah:  number;
  salaryUah:  number;
  leaseUah:   number;
  totalUah:   number;
}

export interface SupplyChainReport {
  playerId:            string;
  totalDeliveries:     number;
  deliveredCount:      number;
  failedCount:         number;
  spoilingCount:       number;
  inTransitCount:      number;
  successRate:         number | null;  // delivered / (delivered + failed)
  spoilageRate:        number | null;  // spoiling / total
  avgTransitTicks:     number | null;
  totalFreightSpendUah: number;
  pendingFreightUah:   number;
  topRoutes:           Array<{ fromCityName: string; toCityName: string; deliveryCount: number }>;
}

export interface RecordProductionInput {
  enterpriseId:  string;
  workshopId:    string;
  recipeId:      string;
  unitsProduced: number;
  avgQuality:    number;
}

// ═════════════════════════════════════════════════════════════════════════════

export class AnalyticsService {
  constructor(private readonly db: PrismaClient) {}

  // ── A. Ingest: write ProductionLog (called by TickEngine after production) ─

  /**
   * Batch-inserts one ProductionLog row per workshop that produced output.
   * Uses createMany (single INSERT ... VALUES (...),(...)) for efficiency.
   */
  async recordProductionResults(
    playerId:   string,
    results:    ProductionResult[],
    tickNumber: bigint,
  ): Promise<void> {
    const rows = results.filter(r => r.unitsProduced > 0);
    if (rows.length === 0) return;

    await this.db.productionLog.createMany({
      data: rows.map(r => ({
        playerId,
        enterpriseId:  r.enterpriseId,
        workshopId:    r.workshopId,
        recipeId:      r.recipeId,
        tickNumber,
        unitsProduced: r.unitsProduced,
        avgQuality:    r.outputQuality,
      })),
      skipDuplicates: false,
    });
  }

  // ── B. Snapshot: pre-aggregate P&L into DailySnapshot ────────────────────

  /**
   * Writes one DailySnapshot row per player every TICKS_PER_SNAPSHOT ticks.
   * Idempotent — silently returns if the row already exists.
   *
   * Covers the period (lastSnapshotTick + 1 … currentTick).
   */
  async populateDailySnapshot(
    playerId:    string,
    currentTick: bigint,
  ): Promise<void> {
    // Idempotency guard
    const exists = await this.db.dailySnapshot.findUnique({
      where: { playerId_tickNumber: { playerId, tickNumber: currentTick } },
      select: { id: true },
    });
    if (exists) return;

    const gameWeek = currentTick / TICKS_PER_SNAPSHOT;

    // Determine lookback window (since previous snapshot)
    const lastSnap = await this.db.dailySnapshot.findFirst({
      where:   { playerId },
      orderBy: { tickNumber: 'desc' },
      select:  { tickNumber: true },
    });
    const fromTick = lastSnap ? lastSnap.tickNumber + 1n : 1n;

    // 1. Current cash balance
    const player = await this.db.player.findUniqueOrThrow({
      where:  { id: playerId },
      select: { cashBalance: true },
    });
    const cashBalance = new Decimal(player.cashBalance.toString());

    // 2. Total assets = cash + market value of all equipment + purchased land
    const [equipSum, landSum] = await Promise.all([
      this.db.$queryRaw<[{ total: string }]>`
        SELECT COALESCE(SUM(e."marketValueUah"), 0)::text AS total
        FROM "Equipment" e
        JOIN "Workshop" w ON w.id = e."workshopId"
        JOIN "Enterprise" ent ON ent.id = w."enterpriseId"
        WHERE ent."playerId" = ${playerId}
      `,
      this.db.landPlot.aggregate({
        where: { playerId, status: 'OWNED' },
        _sum:  { purchasePriceUah: true },
      }),
    ]);

    const equipValue = new Decimal(equipSum[0]?.total ?? '0');
    const landValue  = new Decimal((landSum._sum.purchasePriceUah ?? 0).toString());
    const totalAssetsValue = cashBalance.plus(equipValue).plus(landValue);

    // 3. P&L from FinancialLog for the window [fromTick, currentTick]
    const logs = await this.db.financialLog.findMany({
      where:  { playerId, tickNumber: { gte: fromTick, lte: currentTick } },
      select: { category: true, amountUah: true },
    });

    let revenueUah = ZERO;
    let opexUah    = ZERO;
    let taxPaidUah = ZERO;

    for (const log of logs) {
      const amt = new Decimal(log.amountUah.toString());
      if (REVENUE_CATS.has(log.category)) {
        revenueUah = revenueUah.plus(amt);
      } else if (TAX_CATS.has(log.category)) {
        taxPaidUah = taxPaidUah.plus(amt.abs());
      } else if (OPEX_CATS.has(log.category)) {
        opexUah = opexUah.plus(amt.abs());
      }
    }

    const netProfitUah = revenueUah.minus(opexUah).minus(taxPaidUah);

    // 4. Operational snapshot
    const [empStats, enterpriseCount] = await Promise.all([
      this.db.employee.aggregate({
        where:  { playerId },
        _avg:   { mood: true },
        _count: { id: true },
      }),
      this.db.enterprise.count({ where: { playerId, isOperational: true } }),
    ]);

    await this.db.dailySnapshot.create({
      data: {
        playerId,
        tickNumber:        currentTick,
        gameWeek,
        cashBalance,
        totalAssetsValue,
        revenueUah,
        opexUah,
        taxPaidUah,
        netProfitUah,
        averageWorkerMood: empStats._avg.mood ?? 0.7,
        activeEnterprises: enterpriseCount,
        employeeCount:     empStats._count.id,
      },
    });
  }

  // ── 1. KPI engine ─────────────────────────────────────────────────────────

  /**
   * Computes core financial and operational KPIs for a lookback window.
   *
   * ROI = NetProfit(period) / TotalHistoricalInvestment × 100
   * OPEX/Revenue = (energy + salary + logistics) / (retail + B2B revenue)
   * LaborProductivity = units produced / (salary spend UAH / 1 000)
   */
  async getCompanyPerformanceMetrics(
    playerId:     string,
    daysLookback: number,
  ): Promise<CompanyKPIs> {
    const lastTick = await this.db.gameTick.findFirst({ orderBy: { tickNumber: 'desc' } });
    const currentTick = lastTick?.tickNumber ?? 0n;
    const fromTick    = currentTick > BigInt(daysLookback)
      ? currentTick - BigInt(daysLookback)
      : 0n;

    // Fetch FinancialLog for the window once — reuse for all ratio calculations
    const logs = await this.db.financialLog.findMany({
      where:  { playerId, tickNumber: { gte: fromTick } },
      select: { category: true, amountUah: true },
    });

    let revenueUah = ZERO;
    let opexUah    = ZERO;
    let taxPaidUah = ZERO;
    let salaryUah  = ZERO;

    for (const log of logs) {
      const amt = new Decimal(log.amountUah.toString());
      if (REVENUE_CATS.has(log.category)) {
        revenueUah = revenueUah.plus(amt);
      } else if (TAX_CATS.has(log.category)) {
        taxPaidUah = taxPaidUah.plus(amt.abs());
      } else if (OPEX_CATS.has(log.category)) {
        opexUah = opexUah.plus(amt.abs());
      }
      if (log.category === 'EXPENSE_SALARY') {
        salaryUah = salaryUah.plus(amt.abs());
      }
    }

    const netProfit = revenueUah.minus(opexUah).minus(taxPaidUah);

    // Total historical investment (all-time, not lookback-limited)
    const [landInv, constructInv] = await Promise.all([
      this.db.landPlot.aggregate({
        where: { playerId, status: { in: ['OWNED', 'LEASED'] } },
        _sum:  { purchasePriceUah: true },
      }),
      this.db.constructionProject.aggregate({
        where: { enterprise: { playerId }, status: 'COMPLETED' },
        _sum:  { paidCostUah: true },
      }),
    ]);

    const totalInvestment = new Decimal((landInv._sum.purchasePriceUah ?? 0).toString())
      .plus(new Decimal((constructInv._sum.paidCostUah ?? 0).toString()));

    const roiPct = totalInvestment.isZero()
      ? null
      : netProfit.dividedBy(totalInvestment).times(100).toDecimalPlaces(2).toNumber();

    const opexToRevenue = revenueUah.isZero()
      ? null
      : opexUah.dividedBy(revenueUah).toDecimalPlaces(4).toNumber();

    // Units produced from ProductionLog (indexed on playerId, tickNumber)
    const prodAgg = await this.db.productionLog.aggregate({
      where: { playerId, tickNumber: { gte: fromTick } },
      _sum:  { unitsProduced: true },
    });
    const unitsProduced = prodAgg._sum.unitsProduced ?? 0;

    const laborProductivityIndex = salaryUah.isZero()
      ? null
      : +(unitsProduced / salaryUah.dividedBy(1000).toNumber()).toFixed(4);

    return {
      playerId,
      daysLookback,
      roiPct,
      opexToRevenue,
      laborProductivityIndex,
      netProfitUah:           netProfit.toNumber(),
      totalInvestmentUah:     totalInvestment.toNumber(),
      revenueUah:             revenueUah.toNumber(),
      opexUah:                opexUah.toNumber(),
      taxPaidUah:             taxPaidUah.toNumber(),
      unitsProducedInPeriod:  unitsProduced,
      salarySpendUah:         salaryUah.toNumber(),
    };
  }

  // ── 2. Financial time-series ──────────────────────────────────────────────

  /**
   * Returns an array of financial periods formatted for multi-line charts.
   *
   * WEEK — reads from DailySnapshot (pre-aggregated, fast, full history).
   * DAY  — reads from FinancialLog (last 30 ticks; raw but still indexed).
   *
   * Output matches:
   * { periodLabel, revenue, opex, taxes, netProfit }
   */
  async getFinancialTimeSeries(
    playerId:  string,
    breakdown: 'DAY' | 'WEEK',
  ): Promise<FinancialPeriod[]> {

    if (breakdown === 'WEEK') {
      const snapshots = await this.db.dailySnapshot.findMany({
        where:   { playerId },
        orderBy: { tickNumber: 'asc' },
        select:  {
          gameWeek: true, revenueUah: true,
          opexUah: true, taxPaidUah: true, netProfitUah: true,
        },
      });

      // Multiple snapshots can share the same gameWeek — sum them
      const byWeek = new Map<bigint, { revenue: Decimal; opex: Decimal; taxes: Decimal; netProfit: Decimal }>();
      for (const s of snapshots) {
        const cur = byWeek.get(s.gameWeek) ?? { revenue: ZERO, opex: ZERO, taxes: ZERO, netProfit: ZERO };
        cur.revenue   = cur.revenue.plus(new Decimal(s.revenueUah.toString()));
        cur.opex      = cur.opex.plus(new Decimal(s.opexUah.toString()));
        cur.taxes     = cur.taxes.plus(new Decimal(s.taxPaidUah.toString()));
        cur.netProfit = cur.netProfit.plus(new Decimal(s.netProfitUah.toString()));
        byWeek.set(s.gameWeek, cur);
      }

      const sorted = [...byWeek.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      return sorted.map(([, d], i) => ({
        periodLabel: `Week ${i + 1}`,
        revenue:     d.revenue.toNumber(),
        opex:        d.opex.toNumber(),
        taxes:       d.taxes.toNumber(),
        netProfit:   d.netProfit.toNumber(),
      }));
    }

    // DAY: aggregate from FinancialLog — last 30 ticks
    const lastTick = await this.db.gameTick.findFirst({ orderBy: { tickNumber: 'desc' } });
    const currentTick = lastTick?.tickNumber ?? 0n;
    const fromTick    = currentTick > 29n ? currentTick - 29n : 1n;

    const logs = await this.db.financialLog.findMany({
      where:   { playerId, tickNumber: { gte: fromTick } },
      select:  { tickNumber: true, category: true, amountUah: true },
      orderBy: { tickNumber: 'asc' },
    });

    const byTick = new Map<bigint, { revenue: Decimal; opex: Decimal; taxes: Decimal }>();
    for (const log of logs) {
      const cur = byTick.get(log.tickNumber) ?? { revenue: ZERO, opex: ZERO, taxes: ZERO };
      const amt = new Decimal(log.amountUah.toString());

      if (REVENUE_CATS.has(log.category)) {
        cur.revenue = cur.revenue.plus(amt);
      } else if (TAX_CATS.has(log.category)) {
        cur.taxes = cur.taxes.plus(amt.abs());
      } else if (ALL_OPEX_CATS.has(log.category)) {
        cur.opex = cur.opex.plus(amt.abs());
      }
      byTick.set(log.tickNumber, cur);
    }

    const sorted = [...byTick.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return sorted.map(([tick, d]) => ({
      periodLabel: `Day ${tick.toString()}`,
      revenue:     d.revenue.toNumber(),
      opex:        d.opex.toNumber(),
      taxes:       d.taxes.toNumber(),
      netProfit:   d.revenue.minus(d.opex).minus(d.taxes).toNumber(),
    }));
  }

  // ── 3. Regional cost breakdown (pie / donut chart) ────────────────────────

  /**
   * Groups operational costs (Energy + Salary×1.22 + Lease) by city.
   * Returns records sorted by total cost descending, ready for a Donut chart.
   */
  async getRegionalCostBreakdown(playerId: string): Promise<RegionalCostEntry[]> {
    const LOOKBACK = 30n;  // last in-game month
    const lastTick = await this.db.gameTick.findFirst({ orderBy: { tickNumber: 'desc' } });
    const currentTick = lastTick?.tickNumber ?? 0n;
    const fromTick    = currentTick > LOOKBACK ? currentTick - LOOKBACK : 0n;

    // 1. Energy bills grouped by city (EnergyBill already has cityId denormalized)
    const energyRows = await this.db.energyBill.groupBy({
      by:    ['cityId'],
      where: { playerId, tickNumber: { gte: fromTick } },
      _sum:  { totalUah: true },
    });

    // 2. Salary costs by city (Employee → Enterprise → LandPlot.cityId)
    const employees = await this.db.employee.findMany({
      where:  { playerId },
      select: {
        salaryUah:  true,
        enterprise: { select: { landPlot: { select: { cityId: true } } } },
      },
    });
    const salaryByCity = new Map<string, number>();
    for (const emp of employees) {
      const cityId     = emp.enterprise.landPlot.cityId;
      const grossTotal = Number(emp.salaryUah.toString()) * 1.22; // include employer ESV
      salaryByCity.set(cityId, (salaryByCity.get(cityId) ?? 0) + grossTotal);
    }

    // 3. Land lease costs by city
    const plots = await this.db.landPlot.findMany({
      where:  { playerId, status: { in: ['LEASED', 'OWNED'] } },
      select: { cityId: true, monthlyLeaseCostUah: true },
    });
    const leaseByCity = new Map<string, number>();
    for (const p of plots) {
      const uah = Number(p.monthlyLeaseCostUah.toString());
      leaseByCity.set(p.cityId, (leaseByCity.get(p.cityId) ?? 0) + uah);
    }

    // Collect all cityIds across the three sources
    const allCityIds = new Set([
      ...energyRows.map(r => r.cityId),
      ...salaryByCity.keys(),
      ...leaseByCity.keys(),
    ]);
    if (allCityIds.size === 0) return [];

    const cities = await this.db.city.findMany({
      where:  { id: { in: [...allCityIds] } },
      select: { id: true, name: true, nameUa: true },
    });
    const cityMeta = new Map(cities.map(c => [c.id, c]));

    const rows: RegionalCostEntry[] = [];
    for (const cityId of allCityIds) {
      const energyRow = energyRows.find(r => r.cityId === cityId);
      const energyUah = Number((energyRow?._sum.totalUah ?? 0).toString());
      const salaryUah = salaryByCity.get(cityId) ?? 0;
      const leaseUah  = leaseByCity.get(cityId) ?? 0;
      const totalUah  = energyUah + salaryUah + leaseUah;
      if (totalUah === 0) continue;

      const city = cityMeta.get(cityId);
      rows.push({
        cityId,
        cityName:   city?.name   ?? cityId,
        cityNameUa: city?.nameUa ?? cityId,
        energyUah:  +energyUah.toFixed(2),
        salaryUah:  +salaryUah.toFixed(2),
        leaseUah:   +leaseUah.toFixed(2),
        totalUah:   +totalUah.toFixed(2),
      });
    }

    return rows.sort((a, b) => b.totalUah - a.totalUah);
  }

  // ── 4. Supply-chain efficiency ────────────────────────────────────────────

  /**
   * Analyses delivery history for a player.
   *
   * Metrics:
   *   successRate   = DELIVERED / (DELIVERED + FAILED)
   *   spoilageRate  = SPOILING / total
   *   avgTransitTicks = mean(ticksTotal) for DELIVERED shipments
   *   topRoutes     = 5 most-used city-pairs by delivery count
   */
  async getSupplyChainEfficiency(playerId: string): Promise<SupplyChainReport> {
    const [statusGroups, deliveredRows, inTransitAgg] = await Promise.all([
      this.db.pendingDelivery.groupBy({
        by:    ['status'],
        where: { playerId },
        _count: { id: true },
      }),
      this.db.pendingDelivery.findMany({
        where:   { playerId, status: 'DELIVERED' },
        select:  {
          ticksTotal:     true,
          freightCostUah: true,
          fromWarehouse:  { select: { city: { select: { name: true, nameUa: true } } } },
          toWarehouse:    { select: { city: { select: { name: true, nameUa: true } } } },
        },
      }),
      this.db.pendingDelivery.aggregate({
        where: { playerId, status: 'IN_TRANSIT' },
        _count: { id: true },
        _sum:  { freightCostUah: true },
      }),
    ]);

    const countMap = new Map(statusGroups.map(r => [r.status as string, r._count.id]));
    const delivered     = countMap.get('DELIVERED')  ?? 0;
    const failed        = countMap.get('FAILED')      ?? 0;
    const spoiling      = countMap.get('SPOILING')    ?? 0;
    const inTransitCount = inTransitAgg._count.id;
    const total          = delivered + failed + spoiling + inTransitCount;

    const successRate  = (delivered + failed) > 0 ? delivered / (delivered + failed) : null;
    const spoilageRate = total > 0 ? spoiling / total : null;

    const avgTransitTicks = deliveredRows.length > 0
      ? +(deliveredRows.reduce((s, d) => s + d.ticksTotal, 0) / deliveredRows.length).toFixed(2)
      : null;

    const totalFreightSpendUah = deliveredRows.reduce(
      (s, d) => s + Number(d.freightCostUah.toString()), 0,
    );

    // Route frequency: "CityA → CityB" labels
    const routeFreq = new Map<string, { fromCityName: string; toCityName: string; count: number }>();
    for (const d of deliveredRows) {
      const fromName = d.fromWarehouse.city.name;
      const toName   = d.toWarehouse.city.name;
      const key = `${fromName}→${toName}`;
      const cur = routeFreq.get(key) ?? { fromCityName: fromName, toCityName: toName, count: 0 };
      cur.count++;
      routeFreq.set(key, cur);
    }

    const topRoutes = [...routeFreq.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map(r => ({ fromCityName: r.fromCityName, toCityName: r.toCityName, deliveryCount: r.count }));

    return {
      playerId,
      totalDeliveries:      total,
      deliveredCount:       delivered,
      failedCount:          failed,
      spoilingCount:        spoiling,
      inTransitCount,
      successRate:          successRate !== null ? +successRate.toFixed(4) : null,
      spoilageRate:         spoilageRate !== null ? +spoilageRate.toFixed(4) : null,
      avgTransitTicks,
      totalFreightSpendUah: +totalFreightSpendUah.toFixed(2),
      pendingFreightUah:    +Number((inTransitAgg._sum.freightCostUah ?? 0).toString()).toFixed(2),
      topRoutes,
    };
  }
}
