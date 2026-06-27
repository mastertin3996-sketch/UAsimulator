/**
 * EnergyMarketService — стратегія енергозабезпечення, зелена генерація та надійність мережі.
 *
 * Три рівні відповідальності:
 *
 *   Розрахунок (per-enterprise):
 *     calculateEnterpriseEnergyCostTick()
 *       — повертає вартість енергії за тік для одного підприємства відповідно до його типу живлення
 *
 *   Інвестиції:
 *     installGreenGeneration()
 *       — встановлення СЕС + акумулятора; перевірка площі, CAPEX, +0.05 ComplianceScore
 *
 *   Глобальний тіковий крок:
 *     processEnergyMarketTick()
 *       — оновлює погодний коефіцієнт, заряд батарей, виставляє рахунки
 *         для SOLAR_AUTONOMOUS і DIESEL_BACKUP підприємств; GRID-підприємства
 *         залишаються за EnergyBillingService (але платять лише під час нормальної роботи)
 *
 * ── Математика сонячної генерації ────────────────────────────────────────────
 *
 *   generationKwh = solarCapacityKw × sunCoeff × SOLAR_EFFECTIVE_HOURS × SOLAR_SYSTEM_EFF
 *
 *   sunCoeff (0.05 – 1.35):
 *     seasonal = 0.55 + 0.45 × sin((dayOfYear − 80) × 2π / 365)
 *                → 0.10 взимку (грудень), ~1.00 влітку (червень), в Україні
 *     sunCoeff = clamp(0.05, 1.35, seasonal + uniform_noise(±0.08))
 *
 *   Баланс батареї:
 *     excess   = max(0, generation − consumption)  → заряд до batteryCapacityKwh
 *     shortfall = max(0, consumption − generation − discharge) → докупити з мережі
 *     Мінімальний SoC = 20% ємності (глибокий розряд блокується)
 *
 * ── Дизельний резерв ─────────────────────────────────────────────────────────
 *
 *   При відключенні мережі (POWER_OUTAGE):
 *     fuelCostUah = consumptionKwh × GENERATOR_L_PER_KWH × dieselPriceUah
 *     dieselPriceUah = GlobalMarketTicker(DIESEL_FUEL).priceUsd × FxRate
 *
 * ── GRID-підприємства при відключенні ────────────────────────────────────────
 *
 *   Виробництво = 0 (Production Service знижує efficiencyFactor до 0).
 *   Базова інфраструктура (ОВІК, охорона, аварійне освітлення) продовжує споживати:
 *     blackoutCostUah = basePowerKwhPerTick × tariff × BLACKOUT_MAINTENANCE_RATIO (10%)
 *   Це окремо від StateRegulationService.applyPowerOutageEffect(), який обробляє GRID-штраф.
 *
 * ── EnergyContract ────────────────────────────────────────────────────────────
 *
 *   Якщо підприємство (GRID або SOLAR з мережевим доповненням) має активний контракт,
 *   використовується fixedTariffUah для обсягу ≤ maxKwhPerTick;
 *   надлишок оплачується за city.energyTariffUah.
 */

import { PrismaClient } from '@prisma/client';
import { Decimal }      from '@prisma/client/runtime/library';

// ── Константи ─────────────────────────────────────────────────────────────────

const SOLAR_FOOTPRINT_M2_PER_KW  = 6;                          // 6 м²/кВт (комерційна СЕС)
const SOLAR_CAPEX_UAH_PER_KW     = new Decimal('35000');        // ₴35 000/кВт (~$843 @ 41.5)
const BATTERY_CAPEX_UAH_PER_KWH  = new Decimal('15000');        // ₴15 000/кВт·год LFP
const SOLAR_EFFECTIVE_HOURS      = 4.5;                        // ефективні сонячні год/день, Україна
const SOLAR_SYSTEM_EFF           = 0.88;                       // ПВ + інвертор + кабелі
const GENERATOR_L_PER_KWH        = 0.25;                       // л дизелю на 1 кВт·год
const BATTERY_MIN_SOC            = 0.20;                       // мінімальний SoC перед блоком розряду
const SOLAR_COMPLIANCE_BONUS     = 0.05;                       // +5% ComplianceScore за зелену генерацію
const BLACKOUT_MAINTENANCE_RATIO = 0.10;                       // 10% базового навантаження при аварії

const DIESEL_COMMODITY = 'DIESEL_FUEL';
const FX_RATE_ID       = 'fx-rate-singleton';

// ── Типи результатів ──────────────────────────────────────────────────────────

export interface EnterpriseEnergyResult {
  enterpriseId:   string;
  enterpriseName: string;
  sourceType:     string;
  consumptionKwh: number;
  generationKwh:  number;   // > 0 лише для SOLAR
  batteryDeltaKwh: number;  // > 0 = заряд, < 0 = розряд
  gridSupplementKwh: number;
  costUah:        Decimal;
  transactionType: string;
  gridActive:     boolean;
}

export interface GreenInstallResult {
  enterpriseId:       string;
  solarKwInstalled:   number;
  batteryKwhInstalled: number;
  totalCapexUah:      Decimal;
  newComplianceScore: number;
  newEnergySource:    string;
}

export interface EnergyMarketTickSummary {
  tick:                  bigint;
  sunCoefficient:        number;
  solarEnterprisesCount: number;
  dieselEnterprisesCount: number;
  totalGenerationKwh:    number;
  totalGridSupplementKwh: number;
  totalDieselCostUah:    Decimal;
  totalSolarSavingsUah:  Decimal;
  outageAffectedCities:  string[];
}

// ═════════════════════════════════════════════════════════════════════════════

export class EnergyMarketService {
  constructor(private readonly db: PrismaClient) {}

  // ══════════════════════════════════════════════════════════════════════════
  // ПУБЛІЧНИЙ: розрахунок вартості енергії за тік для одного підприємства
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Обчислює вартість електроенергії за один тік для конкретного підприємства.
   *
   * @param enterpriseId     — id підприємства
   * @param isCityGridActive — false якщо у місті активна POWER_OUTAGE
   * @param sunCoefficient   — коефіцієнт сонячної радіації (0.05–1.35); передається з processEnergyMarketTick
   * @param dieselPriceUah   — поточна ціна дизелю в UAH/л; передається з processTick
   * @returns EnterpriseEnergyResult — деталі споживання та витрат (без запису в БД)
   */
  async calculateEnterpriseEnergyCostTick(
    enterpriseId:    string,
    isCityGridActive: boolean,
    sunCoefficient:  number,
    dieselPriceUah:  Decimal,
  ): Promise<EnterpriseEnergyResult> {
    const enterprise = await this.db.enterprise.findUniqueOrThrow({
      where:   { id: enterpriseId },
      include: {
        workshops: { include: { equipment: true } },
        landPlot:  { include: { city: true } },
        energyContracts: { where: { isActive: true } },
      },
    });

    const city    = enterprise.landPlot.city;
    const cityTariff = new Decimal(city.energyTariffUah.toString());

    // ── Загальне споживання підприємства (кВт·год/тік) ─────────────────────
    const consumptionKwh = this.computeConsumptionKwh(enterprise);

    const baseResult: Omit<EnterpriseEnergyResult, 'costUah' | 'transactionType'> = {
      enterpriseId,
      enterpriseName:    enterprise.name,
      sourceType:        enterprise.energySourceType,
      consumptionKwh,
      generationKwh:     0,
      batteryDeltaKwh:   0,
      gridSupplementKwh: 0,
      gridActive:        isCityGridActive,
    };

    switch (enterprise.energySourceType) {

      // ──────────────────────────────────────────────────────────────────────
      case 'GRID': {
        if (!isCityGridActive) {
          // Аварія: лише аварійне обслуговування інфраструктури
          const blackoutCost = cityTariff
            .times(enterprise.basePowerKwhPerTick)
            .times(BLACKOUT_MAINTENANCE_RATIO);
          return { ...baseResult, costUah: blackoutCost, transactionType: 'ENERGY_BILL' };
        }
        // Нормальна робота: тариф за EnergyContract або міський
        const effectiveTariff = this.resolveGridTariff(enterprise.energyContracts, consumptionKwh, cityTariff);
        const cost = effectiveTariff.times(consumptionKwh);
        return { ...baseResult, costUah: cost, transactionType: 'ENERGY_BILL' };
      }

      // ──────────────────────────────────────────────────────────────────────
      case 'DIESEL_BACKUP': {
        if (!isCityGridActive) {
          // Мережа відключена → генератор працює на повну
          const fuelCostUah = dieselPriceUah
            .times(GENERATOR_L_PER_KWH)
            .times(consumptionKwh);
          return {
            ...baseResult,
            costUah:         fuelCostUah,
            transactionType: 'DIESEL_FUEL_COST',
          };
        }
        // Мережа є → платимо звичайний тариф (генератор у режимі очікування)
        const effectiveTariff = this.resolveGridTariff(enterprise.energyContracts, consumptionKwh, cityTariff);
        const cost = effectiveTariff.times(consumptionKwh);
        return { ...baseResult, costUah: cost, transactionType: 'ENERGY_BILL' };
      }

      // ──────────────────────────────────────────────────────────────────────
      case 'SOLAR_AUTONOMOUS': {
        const solarCapKw      = new Decimal(enterprise.solarCapacityKw.toString()).toNumber();
        const batteryCapKwh   = new Decimal(enterprise.batteryCapacityKwh.toString()).toNumber();
        const currentBatKwh   = new Decimal(enterprise.currentBatteryKwh.toString()).toNumber();

        // Генерація: потужність × сонячний коеф. × ефективні год × ККД системи
        const generationKwh = solarCapKw * sunCoefficient * SOLAR_EFFECTIVE_HOURS * SOLAR_SYSTEM_EFF;

        let batteryDeltaKwh   = 0;
        let gridSupplementKwh = 0;
        let costUah           = new Decimal(0);

        if (generationKwh >= consumptionKwh) {
          // Надлишок → заряджаємо батарею (до ємності)
          const excess = generationKwh - consumptionKwh;
          batteryDeltaKwh = Math.min(excess, batteryCapKwh - currentBatKwh);
          // Вартість = 0 (власна генерація покриває споживання)
        } else {
          // Нестача → спочатку батарея, потім мережа
          const shortfall     = consumptionKwh - generationKwh;
          const minBatKwh     = batteryCapKwh * BATTERY_MIN_SOC;
          const availableBat  = Math.max(0, currentBatKwh - minBatKwh);
          const discharge     = Math.min(shortfall, availableBat);
          batteryDeltaKwh     = -discharge;
          gridSupplementKwh   = shortfall - discharge;

          if (gridSupplementKwh > 0 && isCityGridActive) {
            const effectiveTariff = this.resolveGridTariff(enterprise.energyContracts, gridSupplementKwh, cityTariff);
            costUah = effectiveTariff.times(gridSupplementKwh);
          }
          // Якщо мережа недоступна і батарея пуста — нульові витрати (виробництво зупинено)
        }

        return {
          ...baseResult,
          generationKwh,
          batteryDeltaKwh,
          gridSupplementKwh,
          costUah,
          transactionType: gridSupplementKwh > 0 ? 'ENERGY_BILL' : 'ENERGY_BILL',
        };
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ПУБЛІЧНИЙ: встановлення зеленої генерації (СЕС + акумулятор)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Встановлення СЕС та/або системи акумулювання на підприємстві.
   *
   * Валідація:
   *   1. Підприємство належить гравцю та є операційним
   *   2. Фізичний простір: solarKwPower × 6 м² ≤ вільна площа ділянки
   *   3. Достатній UAH-баланс для оплати CAPEX
   *
   * Ефекти:
   *   - Enterprise: energySourceType = SOLAR_AUTONOMOUS, +solarCapacityKw, +batteryCapacityKwh
   *   - Player: -totalCapexUah
   *   - ComplianceRecord: score += 0.05 (max 1.0) — тригер GREEN_TRANSITION субсидії (Step 14)
   *   - FinancialTransaction: GREEN_ENERGY_INSTALL
   */
  async installGreenGeneration(
    playerId:            string,
    enterpriseId:        string,
    solarKwPower:        number,
    batteryKwhCapacity:  number,
  ): Promise<GreenInstallResult> {
    if (solarKwPower < 0 || batteryKwhCapacity < 0) {
      throw new Error('Потужність СЕС та ємність акумулятора не можуть бути від\'ємними.');
    }
    if (solarKwPower === 0 && batteryKwhCapacity === 0) {
      throw new Error('Потрібно вказати хоча б потужність СЕС або ємність акумулятора > 0.');
    }

    const enterprise = await this.db.enterprise.findUniqueOrThrow({
      where:   { id: enterpriseId },
      include: { landPlot: true },
    });

    if (enterprise.playerId !== playerId) {
      throw new Error('Підприємство не належить цьому гравцю.');
    }
    if (!enterprise.isOperational) {
      throw new Error('Підприємство ще не введено в експлуатацію.');
    }

    // ── Перевірка фізичної площі ─────────────────────────────────────────
    const requiredM2  = solarKwPower * SOLAR_FOOTPRINT_M2_PER_KW;
    const landPlot    = enterprise.landPlot;
    const freeAreaM2  = landPlot.totalAreaM2 - landPlot.usedAreaM2;

    if (requiredM2 > freeAreaM2) {
      throw new Error(
        `Недостатньо вільної площі на ділянці: потрібно ${requiredM2.toFixed(1)} м² ` +
        `(${solarKwPower} кВт × 6 м²/кВт), доступно ${freeAreaM2.toFixed(1)} м².`,
      );
    }

    // ── Розрахунок CAPEX ─────────────────────────────────────────────────
    const solarCapex   = SOLAR_CAPEX_UAH_PER_KW.times(solarKwPower);
    const batteryCapex = BATTERY_CAPEX_UAH_PER_KWH.times(batteryKwhCapacity);
    const totalCapex   = solarCapex.plus(batteryCapex);

    const player     = await this.db.player.findUniqueOrThrow({ where: { id: playerId } });
    const balance    = new Decimal(player.cashBalance.toString());

    if (balance.lessThan(totalCapex)) {
      throw new Error(
        `Недостатньо коштів: потрібно ₴${totalCapex.toFixed(0)}, ` +
        `доступно ₴${balance.toFixed(0)}.`,
      );
    }

    // ── Транзакція ────────────────────────────────────────────────────────
    const newBalance  = balance.minus(totalCapex);
    const newSolarKw  = new Decimal(enterprise.solarCapacityKw.toString()).plus(solarKwPower);
    const newBatKwh   = new Decimal(enterprise.batteryCapacityKwh.toString()).plus(batteryKwhCapacity);

    // ComplianceRecord: +0.05, max 1.0
    const compliance = await this.db.complianceRecord.findUnique({ where: { playerId } });
    const oldScore   = compliance?.score ?? 1.0;
    const newScore   = Math.min(1.0, oldScore + SOLAR_COMPLIANCE_BONUS);

    await this.db.$transaction([
      // Оновлюємо підприємство
      this.db.enterprise.update({
        where: { id: enterpriseId },
        data: {
          energySourceType:   'SOLAR_AUTONOMOUS',
          solarCapacityKw:    newSolarKw,
          batteryCapacityKwh: newBatKwh,
          // Оновлюємо використану площу ділянки
          landPlot: { update: { usedAreaM2: { increment: requiredM2 } } },
        },
      }),
      // Списуємо CAPEX з гравця
      this.db.player.update({
        where: { id: playerId },
        data:  { cashBalance: newBalance },
      }),
      // Фінансовий запис
      this.db.financialTransaction.create({
        data: {
          playerId,
          type:          'GREEN_ENERGY_INSTALL',
          amountUah:     totalCapex.negated(),
          balanceBefore: balance,
          balanceAfter:  newBalance,
          description:
            `СЕС ${solarKwPower} кВт + акумулятор ${batteryKwhCapacity} кВт·год ` +
            `на «${enterprise.name}» | ₴${totalCapex.toFixed(0)} CAPEX`,
          referenceId: enterpriseId,
        },
      }),
      // Оновлюємо ComplianceRecord
      ...(compliance
        ? [this.db.complianceRecord.update({
            where: { playerId },
            data:  { score: newScore },
          })]
        : [this.db.complianceRecord.create({
            data: { playerId, score: newScore },
          })]),
    ]);

    return {
      enterpriseId,
      solarKwInstalled:    solarKwPower,
      batteryKwhInstalled: batteryKwhCapacity,
      totalCapexUah:       totalCapex,
      newComplianceScore:  newScore,
      newEnergySource:     'SOLAR_AUTONOMOUS',
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ПУБЛІЧНИЙ: глобальний тіковий крок енергетичного ринку
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Виконується ЩОТІК у TickEngine (глобально, до циклу гравців):
   *
   *   1. Обчислює погодний/сонячний коефіцієнт (сезонний + шум)
   *   2. Отримує ціну дизелю (GlobalMarketTicker → UAH через FxRateSingleton)
   *   3. Визначає міста з активним POWER_OUTAGE
   *   4. Для всіх SOLAR_AUTONOMOUS та DIESEL_BACKUP підприємств:
   *      a. calculateEnterpriseEnergyCostTick() → отримує деталі
   *      b. Оновлює currentBatteryKwh в БД
   *      c. Виставляє рахунок гравцю (якщо costUah > 0)
   *   5. Повертає зведений підсумок
   *
   * GRID-підприємства оброблюються окремо:
   *   - Нормальна робота → EnergyBillingService.calculateAndBillEnergy() у циклі гравців
   *   - Відключення → StateRegulationService.applyPowerOutageEffect() (GRID-штраф ₴20 000)
   *     + виклик calculateEnterpriseEnergyCostTick(GRID, false) → blackoutCostUah
   */
  async processEnergyMarketTick(currentTick: bigint): Promise<EnergyMarketTickSummary> {
    const summary: EnergyMarketTickSummary = {
      tick:                   currentTick,
      sunCoefficient:         0,
      solarEnterprisesCount:  0,
      dieselEnterprisesCount: 0,
      totalGenerationKwh:     0,
      totalGridSupplementKwh: 0,
      totalDieselCostUah:     new Decimal(0),
      totalSolarSavingsUah:   new Decimal(0),
      outageAffectedCities:   [],
    };

    // ── 1. Сонячний коефіцієнт ────────────────────────────────────────────
    const sunCoeff = this.computeSunCoefficient(currentTick);
    summary.sunCoefficient = sunCoeff;

    // ── 2. Ціна дизелю в UAH/л ────────────────────────────────────────────
    const dieselPriceUah = await this.getDieselPriceUah();

    // ── 3. Активні відключення (POWER_OUTAGE) ────────────────────────────
    const activeOutages = await this.db.macroEvent.findMany({
      where: {
        type:     'POWER_OUTAGE',
        status:   'ACTIVE',
        endTick:  { gte: currentTick },
      },
    });
    const outageCityIds = new Set(
      activeOutages
        .map(e => e.affectedCityId)
        .filter((id): id is string => id !== null),
    );
    summary.outageAffectedCities = [...outageCityIds];

    // ── 4. Підприємства з альтернативним живленням ────────────────────────
    const altEnterprises = await this.db.enterprise.findMany({
      where: {
        isOperational: true,
        energySourceType: { in: ['SOLAR_AUTONOMOUS', 'DIESEL_BACKUP'] },
      },
      include: {
        landPlot:        { include: { city: true } },
        energyContracts: { where: { isActive: true } },
      },
    });

    for (const ent of altEnterprises) {
      const cityId         = ent.landPlot.cityId;
      const isCityGridOn   = !outageCityIds.has(cityId);

      const result = await this.calculateEnterpriseEnergyCostTick(
        ent.id,
        isCityGridOn,
        sunCoeff,
        dieselPriceUah,
      );

      // ── Оновлення батареї (SOLAR_AUTONOMOUS) ─────────────────────────
      if (ent.energySourceType === 'SOLAR_AUTONOMOUS') {
        summary.solarEnterprisesCount++;
        summary.totalGenerationKwh    += result.generationKwh;
        summary.totalGridSupplementKwh += result.gridSupplementKwh;

        const batCap    = new Decimal(ent.batteryCapacityKwh.toString());
        const batBefore = new Decimal(ent.currentBatteryKwh.toString());
        let   newBatKwh = batBefore
          .plus(result.batteryDeltaKwh)
          .clampedTo(new Decimal(0), batCap);

        // Сонячна економія = що б заплатили за GRID × (generation - gridSupplement) / consumption
        const cityTariff = new Decimal(ent.landPlot.city.energyTariffUah.toString());
        const savedKwh   = Math.max(0, result.generationKwh - result.gridSupplementKwh);
        summary.totalSolarSavingsUah = summary.totalSolarSavingsUah.plus(cityTariff.times(savedKwh));

        // ── Енергетична біржа: продаємо надлишок коли батарея повна ────────
        const FEED_IN_RATE = 0.6; // 60% від міського тарифу — feed-in rate
        if (result.batteryDeltaKwh > 0 && newBatKwh.gte(batCap)) {
          const surplusKwh = result.batteryDeltaKwh - batCap.minus(batBefore).toNumber();
          if (surplusKwh > 0.01 && isCityGridOn) {
            const feedInRevenue = cityTariff.times(FEED_IN_RATE).times(surplusKwh);
            const playerBal = await this.db.player.findUnique({
              where: { id: ent.playerId }, select: { cashBalance: true },
            });
            if (playerBal) {
              const balBefore = new Decimal(playerBal.cashBalance.toString());
              const balAfter  = balBefore.plus(feedInRevenue);
              await this.db.$transaction([
                this.db.player.update({
                  where: { id: ent.playerId },
                  data:  { cashBalance: { increment: feedInRevenue } },
                }),
                this.db.enterprise.update({
                  where: { id: ent.id },
                  data:  { energySoldKwhTotal: { increment: surplusKwh } },
                }),
                this.db.financialTransaction.create({
                  data: {
                    playerId:    ent.playerId,
                    type:        'NPC_SALE',
                    amountUah:   feedInRevenue,
                    balanceBefore: balBefore,
                    balanceAfter:  balAfter,
                    description: `Продаж надлишку електроенергії в мережу: ${surplusKwh.toFixed(2)} кВт·год`,
                  },
                }),
              ]);
            }
          }
        }

        await this.db.enterprise.update({
          where: { id: ent.id },
          data:  { currentBatteryKwh: newBatKwh },
        });
      } else {
        summary.dieselEnterprisesCount++;
        if (!isCityGridOn) {
          summary.totalDieselCostUah = summary.totalDieselCostUah.plus(result.costUah);
        }
      }

      // ── Виставлення рахунку (якщо є витрати) ─────────────────────────
      if (result.costUah.greaterThan('0.005')) {
        await this.billEnterprise(ent.playerId, ent.id, result, currentTick);
      }
    }

    return summary;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SEED (idempotent — поки немає дефолтних EnergyContract)
  // ══════════════════════════════════════════════════════════════════════════

  /** Нічого не сідить; метод присутній для єдності з іншими сервісами. */
  async seed(): Promise<void> { /* no-op */ }

  // ══════════════════════════════════════════════════════════════════════════
  // ПРИВАТНЕ
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Обчислює загальне споживання підприємства (кВт·год/тік).
   * Використовує workshop.currentVolume / workshop.maxCapacity як коефіцієнт утилізації
   * (планове завантаження, виставлене гравцем).
   */
  private computeConsumptionKwh(enterprise: {
    basePowerKwhPerTick: number;
    workshops: Array<{
      isActive:           boolean;
      basePowerKwhPerTick: number;
      currentVolume:      number;
      maxCapacity:        number;
      equipment:          Array<{ isBroken: boolean; energyConsumptionKw: number }>;
    }>;
  }): number {
    let kwh = enterprise.basePowerKwhPerTick;

    for (const ws of enterprise.workshops) {
      if (!ws.isActive) continue;
      kwh += ws.basePowerKwhPerTick;

      const utilisation = ws.maxCapacity > 0 ? ws.currentVolume / ws.maxCapacity : 0;
      for (const eq of ws.equipment) {
        if (eq.isBroken) continue;
        kwh += eq.energyConsumptionKw * 24 * utilisation;
      }
    }

    return kwh;
  }

  /**
   * Обчислює погодний/сонячний коефіцієнт для тіку.
   *
   * Сезонна синусоїда для України:
   *   seasonal = 0.55 + 0.45 × sin((dayOfYear − 80) × 2π / 365)
   *   → ~0.10 в грудні, ~1.00 в червні
   *
   * Добовий шум ±0.08 (хмарність → варіабельність).
   */
  private computeSunCoefficient(tick: bigint): number {
    const dayOfYear = Number(tick % 365n);
    const seasonal  = 0.55 + 0.45 * Math.sin((dayOfYear - 80) * (2 * Math.PI / 365));
    const noise     = (Math.random() - 0.5) * 0.16;   // ±0.08
    return Math.max(0.05, Math.min(1.35, seasonal + noise));
  }

  /**
   * Визначає ефективний тариф з урахуванням EnergyContract.
   * Якщо є активний контракт із лімітом ≥ consumptionKwh → fixedTariffUah.
   * Якщо споживання перевищує ліміт → зважений середній тариф.
   */
  private resolveGridTariff(
    contracts:      Array<{ fixedTariffUah: unknown; maxKwhPerTick: number; isActive: boolean }>,
    consumptionKwh: number,
    cityTariff:     Decimal,
  ): Decimal {
    const activeContract = contracts.find(c => c.isActive);
    if (!activeContract) return cityTariff;

    const contractKwh = Math.min(consumptionKwh, activeContract.maxKwhPerTick);
    const excessKwh   = Math.max(0, consumptionKwh - activeContract.maxKwhPerTick);
    const fixedTariff = new Decimal(String(activeContract.fixedTariffUah));

    if (consumptionKwh === 0) return fixedTariff;

    // Зважений тариф: (contractKwh × fixed + excessKwh × city) / total
    const totalCost = fixedTariff.times(contractKwh).plus(cityTariff.times(excessKwh));
    return totalCost.dividedBy(consumptionKwh);
  }

  /**
   * Отримує поточну ціну DIESEL_FUEL в UAH/л із GlobalMarketTicker × FxRate.
   * Fallback: ₴31.00/л (~$0.75 при курсі 41.5).
   */
  private async getDieselPriceUah(): Promise<Decimal> {
    const FALLBACK_UAH_PER_L = new Decimal('31.00');

    const [ticker, fx] = await Promise.all([
      this.db.globalMarketTicker.findUnique({ where: { commodity: DIESEL_COMMODITY } }),
      this.db.fxRateSingleton.findUnique({ where: { id: FX_RATE_ID } }),
    ]);

    if (!ticker || !fx) return FALLBACK_UAH_PER_L;

    // GlobalMarketTicker.priceUsd — USD/барель для DIESEL_FUEL (≈$750 за тонну ≈ $0.75/л)
    // Ми зберігаємо ціну в USD/1 000 л (щоб уникнути дробів < 1) — але spec зберігає в USD/unit.
    // Фактично DIESEL_FUEL.priceUsd = $ за 1 000 л (commodity unit = 1 000 л).
    // Ціна 1 л = priceUsd / 1000 × fxRate
    const priceUsdPerUnit = new Decimal(ticker.priceUsd.toString());   // USD/1 000 л
    const fxRate          = new Decimal(fx.usdToUah.toString());
    return priceUsdPerUnit.dividedBy(1000).times(fxRate);              // UAH/л
  }

  /**
   * Списує вартість енергії з балансу гравця та записує фінансову транзакцію.
   */
  private async billEnterprise(
    playerId:    string,
    enterpriseId: string,
    result:      EnterpriseEnergyResult,
    tick:        bigint,
  ): Promise<void> {
    const player  = await this.db.player.findUniqueOrThrow({ where: { id: playerId } });
    const before  = new Decimal(player.cashBalance.toString());
    const after   = Decimal.max(new Decimal(0), before.minus(result.costUah));

    const descParts: string[] = [
      `Ел/енергія «${result.enterpriseName}» [${result.sourceType}]`,
      `споживання ${result.consumptionKwh.toFixed(2)} кВт·год`,
    ];
    if (result.sourceType === 'SOLAR_AUTONOMOUS') {
      descParts.push(`сонце ${result.generationKwh.toFixed(2)} кВт·год`);
      descParts.push(`мережа ${result.gridSupplementKwh.toFixed(2)} кВт·год`);
      descParts.push(`акумулятор Δ${result.batteryDeltaKwh.toFixed(2)} кВт·год`);
    }
    if (result.transactionType === 'DIESEL_FUEL_COST') {
      descParts.push('(дизельний генератор — відключення мережі)');
    }

    await this.db.$transaction([
      this.db.player.update({
        where: { id: playerId },
        data:  { cashBalance: after },
      }),
      this.db.financialTransaction.create({
        data: {
          playerId,
          type:          result.transactionType as never,
          amountUah:     result.costUah.negated(),
          balanceBefore: before,
          balanceAfter:  after,
          description:   descParts.join(' | ') + ` тік ${tick}`,
          referenceId:   enterpriseId,
        },
      }),
    ]);
  }
}
