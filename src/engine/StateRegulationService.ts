/**
 * StateRegulationService — regulatory & macroeconomic risk layer.
 *
 * Simulates three Ukrainian regulatory realities:
 *
 *  1. LICENSE SYSTEM (ДПС / місцеві органи влади)
 *     Each enterprise type requires a state permit.
 *     Operating without one → ComplianceScore −0.10/tick + risk of B2B/B2C block.
 *
 *  2. TAX INSPECTION (Перевірка ДПС)
 *     Triggered when ComplianceScore < 0.70 (random 15% chance/tick below threshold,
 *     or guaranteed at score < 0.40).
 *     Fine = 200% of detected evasion (unpaid taxes + undeclared salary gap).
 *     Offending enterprise frozen 3 ticks until fine cleared.
 *
 *  3. MACRO EVENTS (2% chance/tick global)
 *     POWER_OUTAGE        — flat ₴20 000 diesel surcharge/enterprise/tick in affected city
 *     LOGISTICS_BOTTLENECK— all in-transit deliveries on route get +2 ticks on event start
 *     GRAIN_MARKET_BOOM   — 35% bonus NPC revenue for agricultural enterprises for 5 ticks
 *
 * Monetary: all UAH values are Decimal.  Probabilities and scores are number.
 */

import { PrismaClient, LicenseType, LicenseStatus, MacroEventType }
  from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { AppError } from '../errors/AppError';

// ── Constants ────────────────────────────────────────────────────────────────

const ZERO = new Decimal(0);

// State fee per license (UAH), fixed for 30 ticks
const LICENSE_FEE: Record<LicenseType, Decimal> = {
  AGRO_PERMIT:           new Decimal('15000'),
  MANUFACTURING_LICENSE: new Decimal('45000'),
  RETAIL_PERMIT:         new Decimal('8000'),
  AGRO_INSURANCE:        new Decimal('5000'),
  EXCISE_LICENSE:        new Decimal('80000'),
};

const LICENSE_DURATION_TICKS = 30n;

// EnterpriseType → required LicenseType (null = no license needed)
const LICENSE_REQUIRED: Partial<Record<string, LicenseType>> = {
  AGRO_FARM:        'AGRO_PERMIT',
  FOOD_PROCESSING:  'AGRO_PERMIT',
  TEXTILE_FACTORY:  'MANUFACTURING_LICENSE',
  RETAIL_STORE:     'RETAIL_PERMIT',
};

// Agricultural enterprise types eligible for GRAIN_MARKET_BOOM bonus
const AGRO_ENTERPRISE_TYPES = new Set(['AGRO_FARM', 'FOOD_PROCESSING']);

const INSPECTION_FREEZE_TICKS = 3n;
const FINE_MULTIPLIER         = new Decimal('2');   // 200% of evaded amount
const SALARY_UNDERPAY_LOOKBACK = 7;                 // ticks assumed underpaid

// Compliance thresholds
const AUDIT_THRESHOLD_PROBABLE  = 0.70;  // random 15% audit chance below this
const AUDIT_THRESHOLD_GUARANTEED = 0.40; // audit guaranteed below this
const AUDIT_PROBABILITY          = 0.15;
const AUDIT_COOLDOWN_TICKS       = 15;   // minimum ticks between audits per player

// Score adjustments per tick
const PENALTY_NO_LICENSE   = 0.10;
const PENALTY_UNPAID_TAX   = 0.05;
const PENALTY_UNDERPAID_SALARY = 0.05;
const PENALTY_MISSED_LOAN  = 0.02;
const RECOVERY_RATE        = 0.01;

// Macro events
const MACRO_EVENT_PROBABILITY = 0.06;     // 6% per global tick (~1 подія кожні 17 тіків)
const POWER_OUTAGE_SURCHARGE  = new Decimal('20000');  // UAH/enterprise/tick
const GRAIN_BOOM_MULTIPLIER   = 1.35;
const GRAIN_BOOM_TICKS        = 5n;
const POWER_OUTAGE_TICKS      = 3n;
const LOGISTICS_DELAY_TICKS   = 2;        // extra ticks added to deliveries
const DROUGHT_TICKS           = 8n;       // тривалість посухи

// ── Return types ─────────────────────────────────────────────────────────────

export interface AuditResult {
  playerId:            string;
  type:                'CLEAN' | 'FINE_ISSUED';
  evadedAmountUah:     Decimal;
  fineAmountUah:       Decimal;
  frozenEnterpriseIds: string[];
  inspectionId?:       string;
}

export interface LicensePurchaseResult {
  licenseId:     string;
  type:          LicenseType;
  enterpriseId:  string;
  expiresAtTick: bigint;
  feePaidUah:    Decimal;
  renewed:       boolean;
}

export interface MacroEventResult {
  fired:       boolean;
  eventId?:    string;
  type?:       MacroEventType;
  description?: string;
}

export interface RegulationTickSummary {
  tick:                 bigint;
  licenseExpiries:      number;
  enterprisesUnfrozen:  number;
  unfrozenEnterprises:  { id: string; name: string; playerId: string }[];
  complianceUpdates:    number;
  auditsTriggered:      number;
  auditResults:         AuditResult[];
  macroEvent:           MacroEventResult;
  macroEffectsApplied:  number;
}

// ═════════════════════════════════════════════════════════════════════════════

export class StateRegulationService {
  constructor(private readonly db: PrismaClient) {}

  // ── 1. Main regulation tick ───────────────────────────────────────────────

  async processRegulationTick(currentTick: bigint): Promise<RegulationTickSummary> {
    const summary: RegulationTickSummary = {
      tick:                currentTick,
      licenseExpiries:     0,
      enterprisesUnfrozen: 0,
      unfrozenEnterprises: [],
      complianceUpdates:   0,
      auditsTriggered:     0,
      auditResults:        [],
      macroEvent:          { fired: false },
      macroEffectsApplied: 0,
    };

    // ── a. Expire outdated macro events ────────────────────────────────────
    await this.db.macroEvent.updateMany({
      where:  { status: 'ACTIVE', endTick: { lt: currentTick } },
      data:   { status: 'EXPIRED' },
    });

    // ── b. Apply effects of still-active macro events ─────────────────────
    summary.macroEffectsApplied = await this.applyActiveMacroEffects(currentTick);

    // ── c. Expire licenses ─────────────────────────────────────────────────
    const expiringLicenses = await this.db.license.findMany({
      where:  { status: 'ACTIVE', expiresAtTick: { lte: currentTick } },
      select: { id: true, playerId: true, type: true, enterpriseId: true },
    });
    if (expiringLicenses.length > 0) {
      await this.db.license.updateMany({
        where: { id: { in: expiringLicenses.map(l => l.id) } },
        data:  { status: 'EXPIRED' },
      });
      const licenseNotifs = expiringLicenses.map(l => ({
        playerId:  l.playerId,
        type:      'LICENSE_EXPIRY',
        title:     'Ліцензія прострочена',
        body:      `Ліцензія типу ${l.type} закінчилась. Поновіть для відновлення роботи.`,
        entityId:  l.enterpriseId,
      }));
      await this.db.notification.createMany({ data: licenseNotifs }).catch(() => {});
    }
    summary.licenseExpiries = expiringLicenses.length;

    // ── d. Unfreeze enterprises whose inspection freeze has ended ──────────
    const toUnfreeze = await this.db.enterprise.findMany({
      where: { isFrozenByInspection: true, inspectionFreezeUntilTick: { lt: currentTick } },
      select: { id: true, name: true, playerId: true },
    });
    if (toUnfreeze.length > 0) {
      await this.db.enterprise.updateMany({
        where: { id: { in: toUnfreeze.map((e) => e.id) } },
        data:  { isFrozenByInspection: false, inspectionFreezeUntilTick: null },
      });
    }
    summary.enterprisesUnfrozen  = toUnfreeze.length;
    summary.unfrozenEnterprises   = toUnfreeze;

    // ── e. Update compliance scores + trigger audits ───────────────────────
    const players = await this.db.player.findMany({
      where:  { isBankrupt: false },
      select: { id: true },
    });

    for (const { id: playerId } of players) {
      const { score: newScore, lastAuditTick } = await this.updateComplianceScore(playerId, currentTick);
      summary.complianceUpdates++;

      const ticksSinceAudit = lastAuditTick != null
        ? Number(currentTick - lastAuditTick)
        : AUDIT_COOLDOWN_TICKS; // no prior audit → eligible

      const shouldAudit =
        ticksSinceAudit >= AUDIT_COOLDOWN_TICKS && (
          newScore < AUDIT_THRESHOLD_GUARANTEED ||
          (newScore < AUDIT_THRESHOLD_PROBABLE && Math.random() < AUDIT_PROBABILITY)
        );

      if (shouldAudit) {
        const auditResult = await this.auditPlayerCompliance(playerId, currentTick);
        summary.auditResults.push(auditResult);
        summary.auditsTriggered++;

        if (auditResult.type === 'FINE_ISSUED') {
          await this.db.notification.create({ data: {
            playerId,
            type:    'AUDIT_FINE',
            title:   'Штраф від ДПС',
            body:    `Аудит виявив порушення. Штраф ₴${Number(auditResult.fineAmountUah).toFixed(0)}. Заморожено підприємств: ${auditResult.frozenEnterpriseIds.length}.`,
            entityId: null,
          }}).catch(() => {});
        } else {
          await this.db.notification.create({ data: {
            playerId,
            type:    'AUDIT_CLEAN',
            title:   'Аудит пройдено успішно',
            body:    'ДПС провела перевірку. Порушень не виявлено.',
            entityId: null,
          }}).catch(() => {});
        }
      }
    }

    // ── f. Macro event roll (2% chance) ───────────────────────────────────
    summary.macroEvent = await this.triggerMacroeconomicEventTick(currentTick);

    return summary;
  }

  // ── 2. Tax inspection / audit ─────────────────────────────────────────────

  async auditPlayerCompliance(
    playerId:    string,
    currentTick: bigint,
  ): Promise<AuditResult> {

    // ── a. Find unpaid tax records ─────────────────────────────────────────
    const unpaidTaxes = await this.db.taxRecord.findMany({
      where:  { playerId, isPaid: false },
      select: { totalUah: true },
    });
    const unpaidTaxTotal = unpaidTaxes.reduce(
      (s, t) => s.plus(new Decimal(t.totalUah.toString())),
      ZERO,
    );

    // ── b. Find employees paid below city baseline ─────────────────────────
    const employees = await this.db.employee.findMany({
      where:   { playerId },
      select:  { id: true, salaryUah: true, enterpriseId: true,
                 enterprise: { select: { landPlot: { select: { city: { select: { wageBaselineUah: true } } } } } } },
    });

    let salaryEvasionTotal = ZERO;
    const offendingEnterpriseIds = new Set<string>();

    for (const emp of employees) {
      const baseline = new Decimal(
        emp.enterprise.landPlot.city.wageBaselineUah.toString(),
      );
      const salary   = new Decimal(emp.salaryUah.toString());
      if (salary.lessThan(baseline.times('0.95'))) {
        // Estimated undeclared gap × lookback ticks
        const gapPerTick = baseline.minus(salary);
        salaryEvasionTotal = salaryEvasionTotal.plus(
          gapPerTick.times(SALARY_UNDERPAY_LOOKBACK),
        );
        offendingEnterpriseIds.add(emp.enterpriseId);
      }
    }

    // Enterprises with unpaid taxes also get frozen
    if (unpaidTaxTotal.greaterThan(0)) {
      const taxedEnts = await this.db.enterprise.findMany({
        where:  { playerId, isOperational: true },
        select: { id: true },
        take:   3,
      });
      taxedEnts.forEach(e => offendingEnterpriseIds.add(e.id));
    }

    const totalEvaded   = unpaidTaxTotal.plus(salaryEvasionTotal);
    const frozenIds     = [...offendingEnterpriseIds];

    if (totalEvaded.lessThanOrEqualTo(new Decimal('100'))) {
      // Clean audit — no material violations
      await this.db.complianceRecord.upsert({
        where:  { playerId },
        update: { lastAuditTick: currentTick, consecutiveViolations: 0 },
        create: { playerId, score: 1.0, lastAuditTick: currentTick },
      });
      return { playerId, type: 'CLEAN', evadedAmountUah: ZERO, fineAmountUah: ZERO, frozenEnterpriseIds: [] };
    }

    const fineAmount = totalEvaded.times(FINE_MULTIPLIER);

    await this.db.$transaction(async (tx) => {
      const player = await tx.player.findUniqueOrThrow({
        where:  { id: playerId },
        select: { cashBalance: true },
      });
      const balanceBefore = new Decimal(player.cashBalance.toString());
      const balanceAfter  = balanceBefore.minus(fineAmount);

      // Deduct fine (may push balance negative → FinanceService handles insolvency)
      await tx.player.update({
        where: { id: playerId },
        data:  { cashBalance: balanceAfter },
      });

      // Freeze offending enterprises for 3 ticks
      if (frozenIds.length > 0) {
        await tx.enterprise.updateMany({
          where: { id: { in: frozenIds } },
          data: {
            isFrozenByInspection:     true,
            inspectionFreezeUntilTick: currentTick + INSPECTION_FREEZE_TICKS,
          },
        });
      }

      // Create inspection record
      await tx.taxInspection.create({
        data: {
          playerId,
          triggerReason:      `ComplianceScore низький. Аудит тік ${currentTick}.`,
          evadedAmountUah:    totalEvaded,
          fineAmountUah:      fineAmount,
          frozenEnterpriseIds: JSON.stringify(frozenIds),
          conductedAtTick:    currentTick,
        },
      });

      // Financial ledger entry
      await tx.financialTransaction.create({
        data: {
          playerId,
          type:          'REGULATORY_FINE',
          amountUah:     fineAmount.negated(),
          balanceBefore,
          balanceAfter,
          description:
            `Штраф ДПС: 200% від ухилення ₴${totalEvaded.toFixed(0)} = ₴${fineAmount.toFixed(0)}. ` +
            `Заморожено підприємств: ${frozenIds.length}.`,
        },
      });

      // Update compliance record — score reset to near zero
      await tx.complianceRecord.upsert({
        where:  { playerId },
        update: { score: 0.20, lastAuditTick: currentTick, consecutiveViolations: 0 },
        create: { playerId, score: 0.20, lastAuditTick: currentTick },
      });
    });

    return {
      playerId,
      type:                'FINE_ISSUED',
      evadedAmountUah:     totalEvaded,
      fineAmountUah:       fineAmount,
      frozenEnterpriseIds: frozenIds,
    };
  }

  // ── 3. License purchase / renewal ─────────────────────────────────────────

  async purchaseOrRenewLicense(
    playerId:      string,
    enterpriseId:  string,
    licenseType:   LicenseType,
  ): Promise<LicensePurchaseResult> {

    const [player, enterprise] = await Promise.all([
      this.db.player.findUniqueOrThrow({ where: { id: playerId } }),
      this.db.enterprise.findUniqueOrThrow({ where: { id: enterpriseId } }),
    ]);

    if (enterprise.playerId !== playerId) {
      throw new AppError('Підприємство не належить гравцю.', 403, 'FORBIDDEN');
    }
    if (player.isBankrupt) {
      throw new AppError('Компанія банкрут — ліцензії не видаються.', 422, 'PLAYER_BANKRUPT');
    }

    const requiredType = LICENSE_REQUIRED[enterprise.type];
    if (requiredType && requiredType !== licenseType) {
      throw new AppError(
        `Для підприємства типу ${enterprise.type} потрібна ліцензія ${requiredType}, а не ${licenseType}.`,
        422,
        'WRONG_LICENSE_TYPE',
      );
    }

    const fee = LICENSE_FEE[licenseType];
    const balance = new Decimal(player.cashBalance.toString());
    if (balance.lessThan(fee)) {
      throw new AppError(
        `Недостатньо коштів: потрібно ₴${fee.toFixed(0)}, наявно ₴${balance.toFixed(0)}.`,
        402,
        'INSUFFICIENT_FUNDS',
      );
    }

    const lastTick = await this.db.gameTick.findFirst({ orderBy: { tickNumber: 'desc' } });
    const currentTick = lastTick?.tickNumber ?? 0n;
    const expiresAtTick = currentTick + LICENSE_DURATION_TICKS;

    let licenseId!: string;
    let renewed     = false;

    await this.db.$transaction(async (tx) => {
      // Check for existing active/expired license on this enterprise for this type
      const existing = await tx.license.findFirst({
        where: { enterpriseId, type: licenseType, status: { in: ['ACTIVE', 'EXPIRED'] } },
        orderBy: { expiresAtTick: 'desc' },
      });

      if (existing) {
        // Renew: extend from MAX(currentTick, expiresAtTick) + 30
        const renewFrom = existing.expiresAtTick > currentTick
          ? existing.expiresAtTick
          : currentTick;
        const newExpiry = renewFrom + LICENSE_DURATION_TICKS;

        await tx.license.update({
          where: { id: existing.id },
          data:  { status: 'ACTIVE', expiresAtTick: newExpiry, feePaidUah: { increment: fee } },
        });
        licenseId = existing.id;
        renewed   = true;
      } else {
        const lic = await tx.license.create({
          data: {
            playerId,
            enterpriseId,
            type:         licenseType,
            status:       'ACTIVE',
            issuedAtTick: currentTick,
            expiresAtTick,
            feePaidUah:   fee,
          },
        });
        licenseId = lic.id;
      }

      const balanceAfter = balance.minus(fee);
      await tx.player.update({
        where: { id: playerId },
        data:  { cashBalance: balanceAfter },
      });

      await tx.financialTransaction.create({
        data: {
          playerId,
          type:          'LICENSE_FEE',
          amountUah:     fee.negated(),
          balanceBefore: balance,
          balanceAfter,
          description:
            `Держмито: ${licenseType} для «${enterprise.name}» ` +
            `(дія до тіку ${renewed ? (existing?.expiresAtTick ?? 0n) + LICENSE_DURATION_TICKS : expiresAtTick})`,
          referenceId:   licenseId,
        },
      });
    });

    return {
      licenseId,
      type:         licenseType,
      enterpriseId,
      expiresAtTick: expiresAtTick,
      feePaidUah:    fee,
      renewed,
    };
  }

  // ── 4. Random macro event roll ────────────────────────────────────────────

  async triggerMacroeconomicEventTick(currentTick: bigint): Promise<MacroEventResult> {
    if (Math.random() > MACRO_EVENT_PROBABILITY) return { fired: false };

    const r = Math.random();
    const type: MacroEventType =
      r < 0.28 ? 'POWER_OUTAGE' :
      r < 0.52 ? 'LOGISTICS_BOTTLENECK' :
      r < 0.70 ? 'GRAIN_MARKET_BOOM' :
      r < 0.83 ? 'DROUGHT' :
      r < 0.92 ? 'PEST_ATTACK' :
                 'CURRENCY_SHOCK';

    switch (type) {
      case 'POWER_OUTAGE':          return this.createPowerOutageEvent(currentTick);
      case 'LOGISTICS_BOTTLENECK':  return this.createLogisticsBottleneckEvent(currentTick);
      case 'GRAIN_MARKET_BOOM':     return this.createGrainBoomEvent(currentTick);
      case 'DROUGHT':               return this.createDroughtEvent(currentTick);
      case 'PEST_ATTACK':           return this.createPestAttackEvent(currentTick);
      case 'CURRENCY_SHOCK':        return this.createCurrencyShockEvent(currentTick);
    }
  }

  // ── Private: macro event constructors ─────────────────────────────────────

  private async createPowerOutageEvent(currentTick: bigint): Promise<MacroEventResult> {
    // Pick a random city with operational enterprises
    const cityRow = await this.db.enterprise.findFirst({
      where:   { isOperational: true },
      include: { landPlot: { select: { cityId: true, city: { select: { nameUa: true } } } } },
      skip:    Math.floor(Math.random() * 10),
    });
    if (!cityRow) return { fired: false };

    const cityId   = cityRow.landPlot.cityId;
    const cityName = cityRow.landPlot.city.nameUa;

    const event = await this.db.macroEvent.create({
      data: {
        type:           'POWER_OUTAGE',
        affectedCityId: cityId,
        startTick:      currentTick,
        endTick:        currentTick + POWER_OUTAGE_TICKS,
        description:
          `Аварійне відключення ел/мережі у ${cityName}. ` +
          `Підприємства сплачують ₴20 000/тік (дизельні генератори) протягом 3 тиків.`,
      },
    });

    return { fired: true, eventId: event.id, type: 'POWER_OUTAGE', description: event.description };
  }

  private async createLogisticsBottleneckEvent(currentTick: bigint): Promise<MacroEventResult> {
    // Pick a high-density route (Kyiv–Lviv or any from DB)
    const route = await this.db.logisticsRoute.findFirst({
      orderBy: { distanceKm: 'desc' },
      include: {
        fromCity: { select: { nameUa: true } },
        toCity:   { select: { nameUa: true } },
      },
    });
    if (!route) return { fired: false };

    // Immediately add +2 ticks to all in-transit deliveries on this route
    const affectedWarehouses = await this.db.warehouse.findMany({
      where: { cityId: { in: [route.fromCityId, route.toCityId] } },
      select: { id: true, cityId: true },
    });
    const fromIds = affectedWarehouses.filter(w => w.cityId === route.fromCityId).map(w => w.id);
    const toIds   = affectedWarehouses.filter(w => w.cityId === route.toCityId).map(w => w.id);

    if (fromIds.length > 0 && toIds.length > 0) {
      // Use $executeRaw for arithmetic increment on ticksRemaining
      await this.db.$executeRaw`
        UPDATE "PendingDelivery"
        SET "ticksRemaining" = "ticksRemaining" + ${LOGISTICS_DELAY_TICKS}
        WHERE status = 'IN_TRANSIT'
          AND "fromWarehouseId" = ANY(${fromIds})
          AND "toWarehouseId"   = ANY(${toIds})
      `;
    }

    const description =
      `Затримки на маршруті ${route.fromCity.nameUa}–${route.toCity.nameUa}: ` +
      `+${LOGISTICS_DELAY_TICKS} тики до всіх активних поставок.`;

    const event = await this.db.macroEvent.create({
      data: {
        type:                'LOGISTICS_BOTTLENECK',
        affectedFromCityId:  route.fromCityId,
        affectedToCityId:    route.toCityId,
        startTick:           currentTick,
        endTick:             currentTick + 4n,
        description,
      },
    });

    return { fired: true, eventId: event.id, type: 'LOGISTICS_BOTTLENECK', description };
  }

  private async createGrainBoomEvent(currentTick: bigint): Promise<MacroEventResult> {
    const description =
      `Зерновий бум: попит NPC на с/г продукцію зростає на 35% протягом 5 тиків.`;

    const event = await this.db.macroEvent.create({
      data: {
        type:            'GRAIN_MARKET_BOOM',
        demandMultiplier: GRAIN_BOOM_MULTIPLIER,
        startTick:        currentTick,
        endTick:          currentTick + GRAIN_BOOM_TICKS,
        description,
      },
    });

    return { fired: true, eventId: event.id, type: 'GRAIN_MARKET_BOOM', description };
  }

  private async createDroughtEvent(currentTick: bigint): Promise<MacroEventResult> {
    const agroEnt = await this.db.enterprise.findFirst({
      where:   { isOperational: true, type: 'AGRO_FARM' },
      include: { landPlot: { select: { cityId: true, city: { select: { nameUa: true } } } } },
      skip:    Math.floor(Math.random() * 5),
    });
    if (!agroEnt) return { fired: false };

    const cityId   = agroEnt.landPlot.cityId;
    const cityName = agroEnt.landPlot.city.nameUa;
    const description = `Посуха у ${cityName}: врожайність AGRO_FARM знижена на 60% протягом ${DROUGHT_TICKS} тіків.`;

    const event = await this.db.macroEvent.create({
      data: { type: 'DROUGHT', affectedCityId: cityId, startTick: currentTick, endTick: currentTick + DROUGHT_TICKS, description },
    });

    // AGRO_INSURANCE payout: ₴4/m² footprint for insured AGRO_FARM enterprises in this city
    const insuredEnts = await this.db.enterprise.findMany({
      where: { isOperational: true, type: 'AGRO_FARM', landPlot: { cityId }, licenses: { some: { type: 'AGRO_INSURANCE', status: 'ACTIVE' } } },
      include: { workshops: { where: { isActive: true }, select: { footprintM2: true } } },
    });
    for (const insEnt of insuredEnts) {
      const totalM2  = insEnt.workshops.reduce((s, w) => s + w.footprintM2, 0);
      const payout   = Math.round(totalM2 * 4);
      if (payout <= 0) continue;
      await this.db.player.update({ where: { id: insEnt.playerId }, data: { cashBalance: { increment: payout } } });
      await this.db.notification.create({ data: {
        playerId: insEnt.playerId, type: 'MACRO_EVENT',
        title: 'Страхова виплата',
        body: `AGRO_INSURANCE: отримано ₴${payout.toLocaleString('uk-UA')} за посуху у ${cityName} (₴4/м² × ${totalM2.toFixed(0)} м²)`,
      } }).catch(() => {});
    }

    return { fired: true, eventId: event.id, type: 'DROUGHT', description };
  }

  private async createPestAttackEvent(currentTick: bigint): Promise<MacroEventResult> {
    const CROP_SKUS = new Set(['RM-WHEAT', 'RM-SUNFL', 'RM-SUGBEET', 'RM-CORN']);

    // Find AGRO_FARM enterprises that have crop inventory
    const agroEnts = await this.db.enterprise.findMany({
      where:   { isOperational: true, type: 'AGRO_FARM' },
      include: {
        landPlot:  { select: { cityId: true, city: { select: { nameUa: true } } } },
        inventory: { include: { product: { select: { sku: true } } } },
      },
    });

    const targets = agroEnts.filter(e =>
      e.inventory.some(i => CROP_SKUS.has(i.product.sku) && i.quantity > 5)
    );
    if (targets.length === 0) return { fired: false };

    const ent = targets[Math.floor(Math.random() * targets.length)];

    // Check for pesticide protection (needs ≥10 kg RM-PESTICIDE)
    const pesticideInv = ent.inventory.find(i => i.product.sku === 'RM-PESTICIDE' && i.quantity >= 10);

    let description: string;

    if (pesticideInv) {
      await this.db.enterpriseInventory.update({
        where: { id: pesticideInv.id },
        data:  { quantity: { decrement: 10 } },
      });
      description = `Нашестя шкідників у "${ent.name}" (${ent.landPlot.city.nameUa}) відбито пестицидами. Витрачено 10 кг.`;
    } else {
      // Destroy 25–40% of all crop inventory
      const destroyFraction = 0.25 + Math.random() * 0.15;
      let totalDestroyed = 0;

      for (const inv of ent.inventory) {
        if (!CROP_SKUS.has(inv.product.sku) || inv.quantity <= 0) continue;
        const destroyed = inv.quantity * destroyFraction;
        await this.db.enterpriseInventory.update({ where: { id: inv.id }, data: { quantity: { decrement: destroyed } } });
        totalDestroyed += destroyed;
      }

      const pct = Math.round(destroyFraction * 100);
      description = `Нашестя шкідників у "${ent.name}" (${ent.landPlot.city.nameUa}): знищено ${pct}% врожаю (≈${totalDestroyed.toFixed(0)} кг). Тримайте RM-PESTICIDE для захисту!`;

      // AGRO_INSURANCE: pay 50% of estimated crop value (₴15/kg average)
      const hasInsurance = await this.db.license.findFirst({
        where: { enterpriseId: ent.id, type: 'AGRO_INSURANCE', status: 'ACTIVE' },
      });
      if (hasInsurance && totalDestroyed > 0) {
        const payout = Math.round(totalDestroyed * 15 * 0.5);
        await this.db.player.update({ where: { id: ent.playerId }, data: { cashBalance: { increment: payout } } });
        await this.db.notification.create({ data: {
          playerId: ent.playerId, type: 'MACRO_EVENT',
          title: 'Страхова виплата',
          body: `AGRO_INSURANCE: отримано ₴${payout.toLocaleString('uk-UA')} за знищений врожай (50% від ${totalDestroyed.toFixed(0)} кг × ₴15/кг)`,
        } }).catch(() => {});
      }
    }

    // Notify affected player
    await this.db.notification.create({
      data: { playerId: ent.playerId, type: 'MACRO_EVENT', title: pesticideInv ? 'Шкідників відбито' : 'Нашестя шкідників', body: description },
    }).catch(() => {});

    const event = await this.db.macroEvent.create({
      data: { type: 'PEST_ATTACK', affectedCityId: ent.landPlot.cityId, startTick: currentTick, endTick: currentTick + 1n, description },
    });

    return { fired: true, eventId: event.id, type: 'PEST_ATTACK', description };
  }

  private async createCurrencyShockEvent(currentTick: bigint): Promise<MacroEventResult> {
    const SHOCK_TICKS = 10n;
    const description = `Девальвація гривні: NPC-ціни ×1.20, споживчий попит −10% протягом ${SHOCK_TICKS} тіків. Підвищуйте ціни поки ринок гарячий.`;
    const event = await this.db.macroEvent.create({
      data: { type: 'CURRENCY_SHOCK', startTick: currentTick, endTick: currentTick + SHOCK_TICKS, description },
    });
    return { fired: true, eventId: event.id, type: 'CURRENCY_SHOCK', description };
  }

  // ── Private: apply active event effects each tick ─────────────────────────

  private async applyActiveMacroEffects(currentTick: bigint): Promise<number> {
    const activeEvents = await this.db.macroEvent.findMany({
      where: { status: 'ACTIVE', startTick: { lte: currentTick } },
    });

    let effectsApplied = 0;

    for (const event of activeEvents) {
      if (event.type === 'POWER_OUTAGE' && event.affectedCityId) {
        effectsApplied += await this.applyPowerOutageEffect(
          event.affectedCityId,
          currentTick,
        );
      }

      if (event.type === 'GRAIN_MARKET_BOOM') {
        effectsApplied += await this.applyGrainBoomEffect(
          event.demandMultiplier,
          currentTick,
        );
      }
      // LOGISTICS_BOTTLENECK effect applied once at creation (delivery time increment)
      // DROUGHT yield reduction is applied per-enterprise in ProductionService
      // CURRENCY_SHOCK and PEST_ATTACK effects applied in MarketService/ProductionService
      if (event.type === 'DROUGHT' || event.type === 'CURRENCY_SHOCK') effectsApplied += 1;
    }

    return effectsApplied;
  }

  /**
   * Charge ₴20 000 flat diesel surcharge per GRID enterprise in the affected city.
   * SOLAR_AUTONOMOUS and DIESEL_BACKUP enterprises are handled by EnergyMarketService
   * (real fuel-cost / zero-cost generation) and are excluded here.
   */
  private async applyPowerOutageEffect(cityId: string, currentTick: bigint): Promise<number> {
    const enterprises = await this.db.enterprise.findMany({
      where:   { isOperational: true, landPlot: { cityId }, energySourceType: 'GRID' },
      select:  { id: true, playerId: true, name: true },
    });

    let charged = 0;
    for (const ent of enterprises) {
      const player = await this.db.player.findUnique({
        where:  { id: ent.playerId },
        select: { cashBalance: true },
      });
      if (!player) continue;

      const before = new Decimal(player.cashBalance.toString());
      const after  = before.minus(POWER_OUTAGE_SURCHARGE);

      await this.db.$transaction([
        this.db.player.update({
          where: { id: ent.playerId },
          data:  { cashBalance: after },
        }),
        this.db.financialTransaction.create({
          data: {
            playerId:      ent.playerId,
            type:          'MACRO_EVENT_CHARGE',
            amountUah:     POWER_OUTAGE_SURCHARGE.negated(),
            balanceBefore: before,
            balanceAfter:  after,
            description:   `Аварія мережі: дизельний генератор «${ent.name}» тік ${currentTick}`,
            referenceId:   ent.id,
          },
        }),
      ]);
      charged++;
    }
    return charged;
  }

  /** Simulate 35% bonus NPC revenue for agricultural enterprises. */
  private async applyGrainBoomEffect(multiplier: number, currentTick: bigint): Promise<number> {
    const agroEnterprises = await this.db.enterprise.findMany({
      where:   { type: { in: ['AGRO_FARM', 'FOOD_PROCESSING'] as any }, isOperational: true },
      select:  { id: true, playerId: true, name: true },
    });

    let bonusCount = 0;
    for (const ent of agroEnterprises) {
      // Estimate daily revenue from last NPC_SALE transaction for this enterprise
      const lastSale = await this.db.financialTransaction.findFirst({
        where:   { playerId: ent.playerId, type: 'NPC_SALE', referenceId: ent.id },
        orderBy: { createdAt: 'desc' },
        select:  { amountUah: true },
      });
      if (!lastSale || new Decimal(lastSale.amountUah.toString()).lessThanOrEqualTo(0)) continue;

      const lastRevenue = new Decimal(lastSale.amountUah.toString()).abs();
      const bonusUah    = lastRevenue.times(new Decimal(String(multiplier - 1)));

      const player = await this.db.player.findUnique({
        where:  { id: ent.playerId },
        select: { cashBalance: true },
      });
      if (!player) continue;

      const before = new Decimal(player.cashBalance.toString());
      const after  = before.plus(bonusUah);

      await this.db.$transaction([
        this.db.player.update({
          where: { id: ent.playerId },
          data:  { cashBalance: after },
        }),
        this.db.financialTransaction.create({
          data: {
            playerId:      ent.playerId,
            type:          'MACRO_EVENT_BONUS',
            amountUah:     bonusUah,
            balanceBefore: before,
            balanceAfter:  after,
            description:   `Зерновий бум: +${((multiplier - 1) * 100).toFixed(0)}% NPC-попит «${ent.name}»`,
            referenceId:   ent.id,
          },
        }),
      ]);
      bonusCount++;
    }
    return bonusCount;
  }

  // ── Private: compliance score calculation ─────────────────────────────────

  /**
   * Recalculates and persists a player's ComplianceScore.
   * Returns the new score.
   */
  private async updateComplianceScore(
    playerId:    string,
    currentTick: bigint,
  ): Promise<{ score: number; lastAuditTick: bigint | null }> {

    const [existing, unpaidTaxes, employees, activeLoans, enterprises] = await Promise.all([
      this.db.complianceRecord.findUnique({ where: { playerId } }),

      this.db.taxRecord.count({ where: { playerId, isPaid: false } }),

      this.db.employee.findMany({
        where:   { playerId },
        select:  { salaryUah: true,
                   enterprise: { select: { landPlot: { select: { city: { select: { wageBaselineUah: true } } } } } } },
      }),

      this.db.loan.findMany({
        where:  { playerId, status: { in: ['ACTIVE', 'OVERDUE'] } },
        select: { missedPayments: true },
      }),

      this.db.enterprise.findMany({
        where:  { playerId, isOperational: true },
        select: { id: true, type: true, isFrozenByInspection: true },
      }),
    ]);

    let score = existing?.score ?? 1.0;
    let hasViolations = false;

    // Deduction: unpaid taxes
    if (unpaidTaxes > 0) {
      score      -= PENALTY_UNPAID_TAX * unpaidTaxes;
      hasViolations = true;
    }

    // Deduction: employees underpaid vs city baseline
    const underpaidCount = employees.filter(emp => {
      const baseline = new Decimal(emp.enterprise.landPlot.city.wageBaselineUah.toString());
      return new Decimal(emp.salaryUah.toString()).lessThan(baseline.times('0.95'));
    }).length;

    if (underpaidCount > 0) {
      score      -= PENALTY_UNDERPAID_SALARY * underpaidCount;
      hasViolations = true;
    }

    // Deduction: missed loan payments
    const totalMissed = activeLoans.reduce((s, l) => s + l.missedPayments, 0);
    if (totalMissed > 0) {
      score      -= PENALTY_MISSED_LOAN * totalMissed;
      hasViolations = true;
    }

    // Deduction: operating without required license
    for (const ent of enterprises) {
      const required = LICENSE_REQUIRED[ent.type];
      if (!required) continue;

      const hasLicense = await this.db.license.findFirst({
        where: { enterpriseId: ent.id, type: required, status: 'ACTIVE' },
      });
      if (!hasLicense) {
        score      -= PENALTY_NO_LICENSE;
        hasViolations = true;
        // Sell order cancellation happens only during audit/freeze, not every score update
      }
    }

    // Recovery: if no violations this tick
    if (!hasViolations) {
      score += RECOVERY_RATE;
    }

    // Clamp to [0, 1]
    score = Math.min(1.0, Math.max(0.0, score));

    const newViolationStreak = hasViolations
      ? (existing?.consecutiveViolations ?? 0) + 1
      : 0;

    await this.db.complianceRecord.upsert({
      where:  { playerId },
      update: { score, consecutiveViolations: newViolationStreak, updatedAt: new Date() },
      create: { playerId, score, consecutiveViolations: newViolationStreak },
    });

    return { score, lastAuditTick: existing?.lastAuditTick ?? null };
  }
}
