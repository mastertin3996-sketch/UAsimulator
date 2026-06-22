/**
 * GameEngineService — єдиний монолітний сервіс обробки ігрового тіку.
 *
 * ВАЖЛИВО: всі грошові значення (баланс, зарплати, тарифи, рахунки) зберігаються
 * та обчислюються як Prisma Decimal (= decimal.js) — без жодного проміжного
 * перетворення у JavaScript number.  Це усуває накопичення похибок IEEE-754
 * при множенні / додаванні великих сум.
 *
 * Єдиний виняток: фізичні величини (кВт·год, коефіцієнти зносу, настрій, якість)
 * залишаються number, бо вони не зберігаються в грошових полях БД.
 *
 * Формула якості:
 *   Quality = BaseMaterialQuality × (avgBaseQualMod × (1 − avgWear)) × workerEff
 * де всі множники — number ∈ [0, 10] або [0, 1].
 */

import { PrismaClient, Prisma, EquipmentStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

// ─── Ukrainian tax rates 2026 ─────────────────────────────────────────────────
// Зберігаємо як Decimal, щоб множення на Decimal-зарплату не втрачало точності.
const TAX = {
  ESV:      new Decimal('0.22'),  // Єдиний соціальний внесок (роботодавець)
  PDFO:     new Decimal('0.18'),  // ПДФО (утримується з працівника)
  MILITARY: new Decimal('0.05'),  // Військовий збір (утримується, ставка 2024+)
} as const;

// ─── Non-monetary simulation constants (можуть бути number) ──────────────────
const HOURS_PER_GAME_DAY   = 24;
const TICKS_PER_MONTH      = 30;
const WEAR_WORN_THRESHOLD  = 0.80;
const WEAR_EFFICIENCY_MULT = 0.50;
const MOOD_UNDERPAY_DELTA  = -0.05;
const MOOD_RECOVERY_DELTA  = +0.01;
const MOOD_LOW_THRESHOLD   = 0.40;

// ─── Prisma include — один round-trip на тік ──────────────────────────────────
const SNAPSHOT_INCLUDE = {
  offices: { include: { city: true } },
  enterprises: {
    where:   { isOperational: true },
    include: {
      landPlot: { include: { city: true } },
      employees: true,
      inventory: true,
      workshops: {
        where:   { isActive: true },
        include: {
          equipment: true,
          productionOrders: {
            where:   { status: 'IN_PROGRESS' },
            include: {
              recipe: {
                include: {
                  inputs:  { include: { product: true } },
                  outputs: true,
                },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.PlayerInclude;

type PlayerSnapshot = Prisma.PlayerGetPayload<{ include: typeof SNAPSHOT_INCLUDE }>;

// ═══════════════════════════════════════════════════════════════════════════════
// INTERNAL TYPES
// Грошові поля — Decimal. Фізичні (кВт·год, знос, якість) — number.
// ═══════════════════════════════════════════════════════════════════════════════

interface CityEnergyLine {
  cityId:   string;
  cityName: string;
  kwh:      number;    // фізичне значення → number
  tariff:   Decimal;   // UAH/кВт·год — Decimal
  costUah:  Decimal;   // UAH — Decimal
}

interface EnergyAudit {
  lines:        CityEnergyLine[];
  totalKwh:     number;    // фізичне → number
  totalCostUah: Decimal;   // UAH → Decimal
}

interface WearDelta {
  equipmentId:          string;
  workshopId:           string;
  name:                 string;
  prevWear:             number;
  newWear:              number;
  newStatus:            EquipmentStatus;
  isBroken:             boolean;
  crossedWornThreshold: boolean;
  outputMultiplier:     number; // 1.0 | 0.5 | 0.0 — безрозмірний
}

interface MoodDelta {
  employeeId:    string;
  enterpriseId:  string;
  prevMood:      number;
  newMood:       number;
  newEfficiency: number;
  isUnderpaid:   boolean;
  dailyAccrual:  Decimal; // UAH → Decimal
}

interface HRResult {
  moodDeltas:           MoodDelta[];
  totalGrossUah:        Decimal; // брутто-нарахування за тік
  totalESVUah:          Decimal; // ЄСВ (додатково до брутто)
  totalPDFOUah:         Decimal; // ПДФО (інфо, утримується з брутто)
  totalMilitaryUah:     Decimal; // Вій. збір (інфо)
  totalEmployerCostUah: Decimal; // брутто + ЄСВ — реальний відтік коштів
}

interface ProductionBatch {
  enterpriseId:      string;
  workshopId:        string;
  orderId:           string;
  unitsProduced:     number;  // фізичні одиниці → number
  qualityScore:      number;  // 0–10 → number
  inputsConsumed:    Array<{ productId: string; qty: number }>;
  outputsByProduct:  Array<{ productId: string; qty: number }>;
  baseMaterialQuality: number;
  avgWear:             number;
  avgBaseQualMod:      number;
  workerEfficiency:    number;
}

// ─── Public result ────────────────────────────────────────────────────────────

export interface TickSummary {
  playerId:      string;
  tickNumber:    bigint;
  processingMs:  number;
  balanceBefore: Decimal;
  balanceAfter:  Decimal;
  netChangeUah:  Decimal;
  energy:        EnergyAudit;
  wearEvents:    WearDelta[];
  hr: {
    totalGrossUah:        Decimal;
    totalESVUah:          Decimal;
    totalPDFOUah:         Decimal;
    totalMilitaryUah:     Decimal;
    totalEmployerCostUah: Decimal;
    lowMoodEmployees:     number;
  };
  production: ProductionBatch[];
}

// ─── Business exceptions ──────────────────────────────────────────────────────

export class BusinessException extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'BusinessException';
  }
}

export class InsufficientFundsError extends BusinessException {
  constructor(required: Decimal, available: Decimal) {
    const deficit = required.minus(available);
    super(
      'INSUFFICIENT_FUNDS',
      `Банкрутство: потрібно ₴${required.toFixed(2)}, ` +
      `на рахунку ₴${available.toFixed(2)}. ` +
      `Дефіцит: ₴${deficit.toFixed(2)}.`,
      {
        required:  required.toFixed(2),
        available: available.toFixed(2),
        deficit:   deficit.toFixed(2),
      },
    );
  }
}

export class CityOfficeRequiredError extends BusinessException {
  constructor(cityName: string) {
    super(
      'CITY_OFFICE_REQUIRED',
      `Для операцій у місті "${cityName}" необхідний діючий офіс.`,
      { cityName },
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

export class GameEngineService {
  constructor(private readonly db: PrismaClient) {}

  // ── Публічна точка входу ──────────────────────────────────────────────────

  async processGameTick(playerId: string): Promise<TickSummary> {
    const startMs = Date.now();

    const player = await this.db.player.findUniqueOrThrow({
      where:   { id: playerId },
      include: SNAPSHOT_INCLUDE,
    });

    // Кроки 1–4: чисті обчислення, без запису в БД
    const energy     = this.computeEnergyAudit(player);
    const wear       = this.computeWearDeltas(player);
    const hr         = this.computeHR(player);
    const production = this.computeProduction(player, wear, hr);

    // Decimal від самого початку — без n() / Number()
    const balanceBefore    = new Decimal(player.cashBalance.toString());
    const totalObligations = energy.totalCostUah.plus(hr.totalEmployerCostUah);

    // Pre-flight перевірка (до транзакції, щоб не витрачати ресурси БД)
    if (balanceBefore.lessThan(totalObligations)) {
      throw new InsufficientFundsError(totalObligations, balanceBefore);
    }

    const lastTick   = await this.db.gameTick.findFirst({ orderBy: { tickNumber: 'desc' } });
    const tickNumber = lastTick ? lastTick.tickNumber + 1n : 1n;

    let balanceAfter!: Decimal;
    await this.db.$transaction(
      async (tx) => {
        balanceAfter = await this.commitTick(
          tx, playerId, tickNumber, balanceBefore, energy, wear, hr, production,
        );
      },
      { timeout: 30_000 },
    );

    return {
      playerId,
      tickNumber,
      processingMs:  Date.now() - startMs,
      balanceBefore,
      balanceAfter,
      netChangeUah:  balanceAfter.minus(balanceBefore),
      energy,
      wearEvents:    wear,
      hr: {
        totalGrossUah:        hr.totalGrossUah,
        totalESVUah:          hr.totalESVUah,
        totalPDFOUah:         hr.totalPDFOUah,
        totalMilitaryUah:     hr.totalMilitaryUah,
        totalEmployerCostUah: hr.totalEmployerCostUah,
        lowMoodEmployees:     hr.moodDeltas.filter(m => m.newMood < MOOD_LOW_THRESHOLD).length,
      },
      production,
    };
  }

  // ── Крок 1: Energy & Utility Billing ─────────────────────────────────────
  //
  // totalKwh — фізична величина (number).
  // costUah  — грошова величина (Decimal): kwh (number) × tariff (Decimal).
  // Decimal.js коректно перетворює number у Decimal при multiple.

  private computeEnergyAudit(player: PlayerSnapshot): EnergyAudit {
    const byCity = new Map<string, CityEnergyLine>();

    const getLine = (cityId: string, cityName: string, tariff: Decimal): CityEnergyLine => {
      if (!byCity.has(cityId)) {
        byCity.set(cityId, {
          cityId, cityName, kwh: 0,
          tariff,
          costUah: new Decimal(0),
        });
      }
      return byCity.get(cityId)!;
    };

    for (const office of player.offices) {
      if (!office.isOperational) continue;
      const tariff = new Decimal(office.city.energyTariffUah.toString());
      const line   = getLine(office.cityId, office.city.name, tariff);
      line.kwh    += office.energyConsumptionKwhPerTick;
    }

    for (const ent of player.enterprises) {
      const city   = ent.landPlot.city;
      const tariff = new Decimal(city.energyTariffUah.toString());
      const line   = getLine(city.id, city.name, tariff);

      line.kwh += ent.basePowerKwhPerTick;

      for (const ws of ent.workshops) {
        const util = ws.maxCapacity > 0
          ? Math.min(1, ws.currentVolume / ws.maxCapacity)
          : 0;

        line.kwh += ws.basePowerKwhPerTick;

        for (const eq of ws.equipment) {
          if (eq.isBroken) continue;
          line.kwh += eq.energyConsumptionKw * HOURS_PER_GAME_DAY * util;
        }
      }
    }

    let totalKwh     = 0;
    let totalCostUah = new Decimal(0);

    for (const line of byCity.values()) {
      // Decimal × number: Decimal.js приймає number як аргумент — точність збережена
      line.costUah  = line.tariff.times(line.kwh);
      totalKwh     += line.kwh;
      totalCostUah  = totalCostUah.plus(line.costUah);
    }

    return { lines: [...byCity.values()], totalKwh, totalCostUah };
  }

  // ── Крок 2: Depreciation & Wear ─────────────────────────────────────────
  //
  // Знос (wearAndTear) — безрозмірний number [0, 1].
  // Грошові наслідки (ринкова вартість) рахуються окремо при продажу.

  private computeWearDeltas(player: PlayerSnapshot): WearDelta[] {
    const deltas: WearDelta[] = [];

    for (const ent of player.enterprises) {
      for (const ws of ent.workshops) {
        const util = ws.maxCapacity > 0
          ? Math.min(1, ws.currentVolume / ws.maxCapacity)
          : 0;

        for (const eq of ws.equipment) {
          if (eq.isBroken) continue;

          const inc       = eq.wearRatePerTick * util;
          const newWear   = Math.min(1.0, eq.wearAndTear + inc);
          const isBroken  = newWear >= 1.0;
          const wasOk     = eq.wearAndTear < WEAR_WORN_THRESHOLD;
          const isNowWorn = newWear >= WEAR_WORN_THRESHOLD;

          let newStatus: EquipmentStatus;
          if      (isBroken)  newStatus = 'BROKEN';
          else if (isNowWorn) newStatus = 'WORN';
          else if (newWear >= 0.10) newStatus = 'OPERATIONAL';
          else                newStatus = 'NEW';

          deltas.push({
            equipmentId:          eq.id,
            workshopId:           ws.id,
            name:                 eq.name,
            prevWear:             eq.wearAndTear,
            newWear,
            newStatus,
            isBroken,
            crossedWornThreshold: wasOk && isNowWorn,
            outputMultiplier:     isBroken ? 0 : isNowWorn ? WEAR_EFFICIENCY_MULT : 1.0,
          });
        }
      }
    }

    return deltas;
  }

  // ── Крок 3: HR & Labor Maintenance ──────────────────────────────────────
  //
  // Усі UAH-суми — Decimal:
  //   grossDaily   = Decimal(salaryUah) / 30
  //   esvDaily     = grossDaily × Decimal("0.22")
  //   pdfoDaily    = grossDaily × Decimal("0.18")
  //   militaryDaily= grossDaily × Decimal("0.05")
  //   employerCost = grossDaily + esvDaily
  //
  // isUnderpaid: grossMonthly.lessThan(wageBaseline) — Decimal-порівняння.

  private computeHR(player: PlayerSnapshot): HRResult {
    const moodDeltas: MoodDelta[] = [];

    let totalGrossUah    = new Decimal(0);
    let totalESVUah      = new Decimal(0);
    let totalPDFOUah     = new Decimal(0);
    let totalMilitaryUah = new Decimal(0);

    for (const ent of player.enterprises) {
      const wageBaseline = new Decimal(ent.landPlot.city.wageBaselineUah.toString());

      for (const emp of ent.employees) {
        const grossMonthly = new Decimal(emp.salaryUah.toString());
        const grossDaily   = grossMonthly.dividedBy(TICKS_PER_MONTH);

        const esvDaily      = grossDaily.times(TAX.ESV);
        const pdfoDaily     = grossDaily.times(TAX.PDFO);
        const militaryDaily = grossDaily.times(TAX.MILITARY);

        totalGrossUah    = totalGrossUah.plus(grossDaily);
        totalESVUah      = totalESVUah.plus(esvDaily);
        totalPDFOUah     = totalPDFOUah.plus(pdfoDaily);
        totalMilitaryUah = totalMilitaryUah.plus(militaryDaily);

        // Порівняння зарплат — через Decimal, без конвертації
        const isUnderpaid = grossMonthly.lessThan(wageBaseline);

        const rawMood       = emp.mood + (isUnderpaid ? MOOD_UNDERPAY_DELTA : MOOD_RECOVERY_DELTA);
        const newMood       = clamp(rawMood, 0, 1);
        const newEfficiency = clamp(
          newMood < MOOD_LOW_THRESHOLD
            ? emp.baseEfficiency * (newMood / MOOD_LOW_THRESHOLD)
            : emp.baseEfficiency,
          0, 1,
        );

        moodDeltas.push({
          employeeId:    emp.id,
          enterpriseId:  ent.id,
          prevMood:      emp.mood,
          newMood,
          newEfficiency,
          isUnderpaid,
          dailyAccrual:  grossDaily, // Decimal — зберігатиметься в accruedSalaryUah
        });
      }
    }

    return {
      moodDeltas,
      totalGrossUah,
      totalESVUah,
      totalPDFOUah,
      totalMilitaryUah,
      totalEmployerCostUah: totalGrossUah.plus(totalESVUah),
    };
  }

  // ── Крок 4: Production & Quality ────────────────────────────────────────
  //
  // Якість та об'єми виробництва — number (фізичні одиниці, 0–10).
  // Грошові розрахунки від виробництва (виручка) — у MarketService.

  private computeProduction(
    player: PlayerSnapshot,
    wear:   WearDelta[],
    hr:     HRResult,
  ): ProductionBatch[] {
    const wearByEq  = new Map(wear.map(w => [w.equipmentId, w]));
    const moodByEmp = new Map(hr.moodDeltas.map(m => [m.employeeId, m]));
    const batches: ProductionBatch[] = [];

    for (const ent of player.enterprises) {
      const workers      = ent.employees.map(e => moodByEmp.get(e.id)?.newEfficiency ?? e.efficiency);
      const avgWorkerEff = workers.length > 0
        ? workers.reduce((s, v) => s + v, 0) / workers.length
        : 0;

      for (const ws of ent.workshops) {
        if (ws.currentVolume <= 0) continue;

        const activeEq = ws.equipment.filter(e => !e.isBroken);
        if (activeEq.length === 0) continue;

        const avgOutputMult = activeEq.reduce((s, eq) => {
          const d = wearByEq.get(eq.id);
          return s + (d?.outputMultiplier ?? (eq.wearAndTear >= WEAR_WORN_THRESHOLD ? WEAR_EFFICIENCY_MULT : 1.0));
        }, 0) / activeEq.length;

        const avgWear = activeEq.reduce((s, eq) => {
          const d = wearByEq.get(eq.id);
          return s + (d?.newWear ?? eq.wearAndTear);
        }, 0) / activeEq.length;

        const avgBaseQualMod = activeEq.reduce((s, eq) => s + eq.baseQualityModifier, 0) / activeEq.length;
        const equipCapacity  = ws.maxCapacity * avgOutputMult * avgWorkerEff;

        for (const order of ws.productionOrders) {
          const recipe    = order.recipe;
          const remaining = order.targetQuantity - order.completedQuantity;

          let materialLimit  = Infinity;
          let baseMatQualSum = 0;
          let baseMatQualWt  = 0;
          let hasAllInputs   = true;

          for (const inp of recipe.inputs) {
            const inv   = ent.inventory.find(i => i.productId === inp.productId);
            const avail = inv?.quantity ?? 0;
            if (avail < 0.001) { hasAllInputs = false; break; }
            materialLimit  = Math.min(materialLimit, avail / inp.quantityPerUnit);
            baseMatQualSum += (inv?.avgQuality ?? 5) * inp.quantityPerUnit;
            baseMatQualWt  += inp.quantityPerUnit;
          }

          if (!hasAllInputs || !isFinite(materialLimit) || materialLimit < 0.001) continue;

          const actualOutput = Math.min(equipCapacity, materialLimit, ws.currentVolume, remaining);
          if (actualOutput < 0.001) continue;

          const baseMaterialQuality = baseMatQualWt > 0 ? baseMatQualSum / baseMatQualWt : 5;
          const qualityScore        = clamp(
            baseMaterialQuality * avgBaseQualMod * (1 - avgWear) * avgWorkerEff,
            0, 10,
          );

          batches.push({
            enterpriseId:   ent.id,
            workshopId:     ws.id,
            orderId:        order.id,
            unitsProduced:  actualOutput,
            qualityScore,
            inputsConsumed:   recipe.inputs.map(i => ({ productId: i.productId, qty: i.quantityPerUnit * actualOutput })),
            outputsByProduct: recipe.outputs.map(o => ({ productId: o.productId, qty: o.quantityPerUnit * actualOutput })),
            baseMaterialQuality,
            avgWear,
            avgBaseQualMod,
            workerEfficiency: avgWorkerEff,
          });
        }
      }
    }

    return batches;
  }

  // ── Крок 5: Atomic financial settlement ─────────────────────────────────
  //
  // Єдина $transaction.  Баланс — Decimal весь час.
  // Конвертація у number лише для FinancialTransaction.description (рядок).

  private async commitTick(
    tx:            Prisma.TransactionClient,
    playerId:      string,
    tickNumber:    bigint,
    balanceBefore: Decimal,
    energy:        EnergyAudit,
    wear:          WearDelta[],
    hr:            HRResult,
    production:    ProductionBatch[],
  ): Promise<Decimal> {

    // Race-condition safety: перечитати баланс всередині транзакції
    const fresh = await tx.player.findUniqueOrThrow({
      where:  { id: playerId },
      select: { cashBalance: true },
    });
    // Обов'язково через toString(), бо Prisma повертає Decimal-like object
    let balance    = new Decimal(fresh.cashBalance.toString());
    const totalDebt = energy.totalCostUah.plus(hr.totalEmployerCostUah);

    if (balance.lessThan(totalDebt)) {
      throw new InsufficientFundsError(totalDebt, balance);
    }

    // ── 5а. Комунальні платежі ──────────────────────────────────────────
    if (energy.totalCostUah.greaterThan(0)) {
      const before  = balance;
      balance       = balance.minus(energy.totalCostUah);

      for (const line of energy.lines) {
        if (line.kwh < 0.001) continue;
        await tx.energyBill.create({
          data: {
            playerId,
            cityId:         line.cityId,
            tickNumber,
            consumptionKwh: line.kwh,
            tariffUah:      line.tariff,    // Decimal → Prisma Decimal ✓
            totalUah:       line.costUah,   // Decimal → Prisma Decimal ✓
            isPaid:         true,
          },
        });
      }

      await tx.financialTransaction.create({
        data: {
          playerId,
          type:          'ENERGY_BILL',
          amountUah:     energy.totalCostUah.negated(),   // Decimal ✓
          balanceBefore: before,                           // Decimal ✓
          balanceAfter:  balance,                          // Decimal ✓
          description:   `Електроенергія тік ${tickNumber}: ${energy.totalKwh.toFixed(1)} кВт·год`,
          referenceId:   tickNumber.toString(),
        },
      });
    }

    // ── 5б. Оплата праці ───────────────────────────────────────────────
    // Роботодавець сплачує: брутто + ЄСВ.
    // ПДФО та Вій. збір — утримані з брутто (реального відтоку не формують).
    if (hr.totalEmployerCostUah.greaterThan(0)) {
      const before = balance;
      balance      = balance.minus(hr.totalEmployerCostUah);

      await tx.financialTransaction.create({
        data: {
          playerId,
          type:          'SALARY_PAYMENT',
          amountUah:     hr.totalEmployerCostUah.negated(),
          balanceBefore: before,
          balanceAfter:  balance,
          description:
            `ЗП тік ${tickNumber}: ` +
            `брутто ₴${hr.totalGrossUah.toFixed(2)} ` +
            `+ ЄСВ ₴${hr.totalESVUah.toFixed(2)} ` +
            `(ПДФО ₴${hr.totalPDFOUah.toFixed(2)} ` +
            `+ Вій ₴${hr.totalMilitaryUah.toFixed(2)} — утримано)`,
          referenceId: tickNumber.toString(),
        },
      });

      for (const delta of hr.moodDeltas) {
        await tx.employee.update({
          where: { id: delta.employeeId },
          data:  {
            mood:             delta.newMood,
            efficiency:       delta.newEfficiency,
            accruedSalaryUah: { increment: delta.dailyAccrual }, // Decimal increment ✓
          },
        });
      }
    }

    // ── 5в. Знос обладнання ──────────────────────────────────────────
    for (const d of wear) {
      await tx.equipment.update({
        where: { id: d.equipmentId },
        data:  { wearAndTear: d.newWear, isBroken: d.isBroken, status: d.newStatus },
      });
    }

    // ── 5г. Виробничі операції ───────────────────────────────────────
    for (const batch of production) {
      for (const inp of batch.inputsConsumed) {
        const inv = await tx.enterpriseInventory.findUnique({
          where: { enterpriseId_productId: { enterpriseId: batch.enterpriseId, productId: inp.productId } },
        });
        if (!inv) continue;
        await tx.enterpriseInventory.update({
          where: { id: inv.id },
          data:  { quantity: Math.max(0, inv.quantity - inp.qty) },
        });
      }

      for (const out of batch.outputsByProduct) {
        const existing = await tx.enterpriseInventory.findUnique({
          where: { enterpriseId_productId: { enterpriseId: batch.enterpriseId, productId: out.productId } },
        });

        if (existing) {
          const totalQty = existing.quantity + out.qty;
          const newAvgQ  = totalQty > 0
            ? (existing.avgQuality * existing.quantity + batch.qualityScore * out.qty) / totalQty
            : batch.qualityScore;
          await tx.enterpriseInventory.update({
            where: { id: existing.id },
            data:  { quantity: totalQty, avgQuality: newAvgQ },
          });
        } else {
          await tx.enterpriseInventory.create({
            data: {
              enterpriseId: batch.enterpriseId,
              productId:    out.productId,
              quantity:     out.qty,
              avgQuality:   batch.qualityScore,
            },
          });
        }
      }

      const order        = await tx.productionOrder.findUniqueOrThrow({ where: { id: batch.orderId } });
      const newCompleted = order.completedQuantity + batch.unitsProduced;
      const isDone       = newCompleted >= order.targetQuantity - 0.001;

      await tx.productionOrder.update({
        where: { id: batch.orderId },
        data:  {
          completedQuantity: newCompleted,
          outputQuality:     batch.qualityScore,
          ticksRemaining:    Math.max(0, order.ticksRemaining - 1),
          status:            isDone ? 'COMPLETED' : 'IN_PROGRESS',
          completedAt:       isDone ? new Date() : null,
        },
      });
    }

    // ── 5д. Записати оновлений баланс та тік ────────────────────────
    await tx.player.update({
      where: { id: playerId },
      data:  { cashBalance: balance, lastActiveAt: new Date() }, // Decimal → Prisma ✓
    });

    await tx.gameTick.create({
      data: {
        tickNumber,
        gameDay:     tickNumber,
        startedAt:   new Date(),
        completedAt: new Date(),
      },
    });

    return balance; // Decimal
  }
}

// ─── Non-monetary utility (тільки для number-полів) ──────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
