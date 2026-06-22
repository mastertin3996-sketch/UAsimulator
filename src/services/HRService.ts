import { PrismaClient, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { MOOD, moodToProductivity, TICKS_PER_MONTH } from '../constants/economic';
import type { HRTickResult } from '../types';
import { clamp } from '../types';

// Тип для findMany з вкладеним include на cityId/wageBaselineUah
type EmployeeWithCity = Prisma.EmployeeGetPayload<{
  include: {
    enterprise: {
      include: {
        landPlot: {
          include: { city: { select: { wageBaselineUah: true } } };
        };
      };
    };
  };
}>;

export class HRService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Щодня нараховує 1/30 місячної зарплати та оновлює настрій і ефективність.
   * НЕ знімає гроші з балансу — це робить disburseSalaries() раз на 30 тиків.
   *
   * Механіка настрою (per-tick delta):
   *   Δmood = drift + overworkPenalty + payForce + underpayPenalty
   *
   * underpayPenalty:
   *   Якщо salaryUah < cityWageBaseline → лінійний штраф до -UNDERPAY_PENALTY_MAX/тік.
   *   При salary = 0% від базового: -0.06/тік. При 50% базового: -0.03/тік.
   *   Це означає, що зарплата ₴5 000 у Києві (базова ~₴20 300) дає ~−0.045/тік,
   *   і через ~10 тиків настрій впаде нижче порогу страйку 0.25.
   */
  async processTick(
    playerId:                string,
    tickNumber:              bigint,
    overworkedEnterpriseIds: Set<string>,
  ): Promise<HRTickResult[]> {
    const employees: EmployeeWithCity[] = await this.prisma.employee.findMany({
      where:   { playerId },
      include: {
        enterprise: {
          include: {
            landPlot: {
              include: { city: { select: { wageBaselineUah: true } } },
            },
          },
        },
      },
    });

    const results: HRTickResult[] = [];

    for (const emp of employees) {
      // Поденне нарахування (брутто / 30) — Decimal всередині, number для результату
      const grossMonthly = new Decimal(emp.salaryUah.toString());
      const dailySalary  = grossMonthly.dividedBy(Number(TICKS_PER_MONTH));
      const moodBefore   = emp.mood; // 0.0–1.0

      // ── Сили, що впливають на настрій ────────────────────────────────
      // 1. Природний дрейф до рівноваги
      const drift = (MOOD.NATURAL_TARGET - moodBefore) * MOOD.DRIFT_RATE;

      // 2. Штраф за перевантаження цеху
      const overworkPenalty = overworkedEnterpriseIds.has(emp.enterpriseId)
        ? MOOD.OVERWORK_PENALTY : 0;

      // 3. Штраф за зарплату нижче міського базового рівня
      const cityBaseline = new Decimal(
        emp.enterprise.landPlot.city.wageBaselineUah.toString(),
      );
      const salaryNum    = new Decimal(emp.salaryUah.toString()).toNumber();
      const baselineNum  = cityBaseline.toNumber();
      let underpayPenalty = 0;
      if (salaryNum < baselineNum && baselineNum > 0) {
        // underpayRatio: 0.0 на рівні базового → 1.0 при salary = ₴0
        const underpayRatio = 1 - salaryNum / baselineNum;
        underpayPenalty     = -MOOD.UNDERPAY_PENALTY_MAX * underpayRatio;
      }

      // 4. Реакція на виплату зарплати (раз на 30 тиків)
      let payForce = 0;
      if (tickNumber % TICKS_PER_MONTH === 0n) {
        const ticksSinceLastPay = emp.lastPaidAt
          ? Math.floor((Date.now() - emp.lastPaidAt.getTime()) / (1000 * 3600))
          : Infinity;

        if (ticksSinceLastPay <= 31)         payForce = MOOD.PAID_ON_TIME_BONUS;
        else if (ticksSinceLastPay <= 60)    payForce = MOOD.LATE_PAY_PENALTY;
        else                                 payForce = MOOD.NO_PAY_60TICK_PENALTY;
      }

      const newMood = clamp(moodBefore + drift + overworkPenalty + payForce + underpayPenalty, 0, 1);
      const efficiency   = moodToProductivity(newMood); // 0.0–1.15

      // ── Страйк ───────────────────────────────────────────────────────
      let wentOnStrike    = false;
      let strikeResolved  = false;
      let isOnStrike      = emp.isOnStrike;
      let strikeStartedTick: bigint | null = emp.strikeStartedTick;

      if (!isOnStrike && newMood < MOOD.STRIKE_THRESHOLD) {
        const strikeChance = (MOOD.STRIKE_THRESHOLD - newMood) / MOOD.STRIKE_THRESHOLD * 0.25;
        if (Math.random() < strikeChance) {
          isOnStrike        = true;
          strikeStartedTick = tickNumber;
          wentOnStrike      = true;
        }
      } else if (isOnStrike) {
        const ticksOnStrike = strikeStartedTick != null
          ? Number(tickNumber - strikeStartedTick) : 0;

        if (newMood >= MOOD.STRIKE_AUTO_RESOLVE && ticksOnStrike >= 5 && Math.random() < 0.5) {
          isOnStrike        = false;
          strikeStartedTick = null;
          strikeResolved    = true;
        }
      }

      await this.prisma.employee.update({
        where: { id: emp.id },
        data: {
          mood:             newMood,
          efficiency,
          isOnStrike,
          strikeStartedTick,
          accruedSalaryUah: { increment: dailySalary },  // Decimal ✓
        },
      });

      results.push({
        employeeId:         emp.id,
        moodBefore,
        moodAfter:          newMood,
        efficiency,
        wentOnStrike,
        strikeResolved,
        dailySalaryAccrued: dailySalary.toNumber(),
      });
    }

    return results;
  }

  /**
   * Виплачує місячні зарплати всім працівникам гравця.
   * Відтік коштів = брутто × 1.22 (брутто + ЄСВ 22%).
   * ПДФО 18% та Вій. збір 5% утримуються з брутто (чиста = брутто × 0.77).
   */
  async disburseSalaries(playerId: string, tickNumber: bigint): Promise<Decimal> {
    const employees = await this.prisma.employee.findMany({ where: { playerId } });
    if (employees.length === 0) return new Decimal(0);

    const totalGross = employees.reduce(
      (s, e) => s.plus(new Decimal(e.salaryUah.toString())),
      new Decimal(0),
    );
    const esvAmount   = totalGross.times('0.22');
    const pdfoAmount  = totalGross.times('0.18');  // інформаційно
    const militaryAmt = totalGross.times('0.05');  // інформаційно
    const totalOutflow = totalGross.plus(esvAmount);

    const player        = await this.prisma.player.findUniqueOrThrow({ where: { id: playerId } });
    const balanceBefore = new Decimal(player.cashBalance.toString());

    if (balanceBefore.lessThan(totalOutflow)) {
      console.warn(
        `[HR] Гравець ${playerId}: недостатньо коштів для ФОП. ` +
        `Потрібно ₴${totalOutflow.toFixed(2)}, є ₴${balanceBefore.toFixed(2)}`,
      );
      return new Decimal(0);
    }

    const balanceAfter = balanceBefore.minus(totalOutflow);
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.player.update({
        where: { id: playerId },
        data:  { cashBalance: balanceAfter },           // Decimal ✓
      }),
      ...employees.map(e =>
        this.prisma.employee.update({
          where: { id: e.id },
          data:  { lastPaidAt: now, accruedSalaryUah: new Decimal(0) },
        }),
      ),
      this.prisma.financialTransaction.create({
        data: {
          playerId,
          type:          'SALARY_PAYMENT',
          amountUah:     totalOutflow.negated(),        // Decimal ✓
          balanceBefore,                                // Decimal ✓
          balanceAfter,                                 // Decimal ✓
          description:
            `ФОП тік ${tickNumber}: ${employees.length} прац. ` +
            `брутто ₴${totalGross.toFixed(0)} + ЄСВ ₴${esvAmount.toFixed(0)} ` +
            `(ПДФО ₴${pdfoAmount.toFixed(0)} + Вій ₴${militaryAmt.toFixed(0)} — утримано)`,
          referenceId: tickNumber.toString(),
        },
      }),
    ]);

    return totalOutflow;
  }

  /**
   * Зважена ефективність робочої сили цеху (0.0–1.0).
   * Страйкуючі не враховуються; масштабується на частку активних.
   */
  workshopLabourEfficiency(
    employees: Array<{ isOnStrike: boolean; efficiency: number }>,
  ): number {
    if (employees.length === 0) return 0;
    const active = employees.filter(e => !e.isOnStrike);
    if (active.length === 0) return 0;
    const avgEff     = active.reduce((s, e) => s + e.efficiency, 0) / active.length;
    const strikeCoef = active.length / employees.length;
    return Math.min(1, avgEff * strikeCoef);
  }

  /** Середній настрій активних (не страйкуючих) працівників (0.0–1.0). */
  avgActiveMood(employees: Array<{ isOnStrike: boolean; mood: number }>): number {
    const active = employees.filter(e => !e.isOnStrike);
    if (active.length === 0) return 0;
    return active.reduce((s, e) => s + e.mood, 0) / active.length;
  }
}
