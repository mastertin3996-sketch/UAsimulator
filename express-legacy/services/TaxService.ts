/**
 * TaxService — щомісячний розрахунок податків.
 *
 * РОЗПОДІЛ ВІДПОВІДАЛЬНОСТІ:
 *
 *   GameEngineService (щодня, кожен тік):
 *     Знімає з балансу: брутто + ЄСВ 22%.
 *     ПДФО 18% та Вій. збір 5% утримуються з брутто — реального додаткового
 *     відтоку для роботодавця не створюють.
 *     Транзакція: SALARY_PAYMENT, сума = -(gross × 1.22)
 *
 *   TaxService (раз на 30 тиків):
 *     Рахує ТІЛЬКИ ПДВ та Податок на прибуток.
 *     ЄСВ/ПДФО/Вій.збір НЕ нараховує повторно — вони вже сплачені щодня.
 *     В TaxRecord зберігає інформаційні значення payroll-податків (для звітності).
 *
 * Витрати для бази CIT (deductible):
 *   ENERGY_BILL, SALARY_PAYMENT, LAND_LEASE_PAYMENT,
 *   CONSTRUCTION_COST, MARKET_PURCHASE, MAINTENANCE_COST
 *
 * НЕ deductible:
 *   TAX_PAYMENT  — не можна вирахувати CIT з бази CIT
 *   LOAN_REPAYMENT — балансова операція, не P&L витрата
 */

import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { TAX_RATES } from '../constants/economic';
import type { TaxBreakdown } from '../types';

// Типи FinancialTransaction, що є операційними витратами для бази CIT
const CIT_DEDUCTIBLE_TYPES = new Set([
  'ENERGY_BILL',
  'SALARY_PAYMENT',       // брутто + ЄСВ — deductible labor costs
  'LAND_LEASE_PAYMENT',
  'CONSTRUCTION_COST',
  'MARKET_PURCHASE',
  'MAINTENANCE_COST',
]);

export class TaxService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Розраховує та записує місячний податковий запис.
   * Викликається TickEngine кожні 30 тиків.
   */
  async calculateMonthlyTax(
    playerId:        string,
    tickNumber:      bigint,
    periodStartDate: Date,
    periodEndDate:   Date,
  ): Promise<TaxBreakdown> {
    const txns = await this.prisma.financialTransaction.findMany({
      where: {
        playerId,
        createdAt: { gte: periodStartDate, lte: periodEndDate },
      },
    });

    let totalRevenue    = new Decimal(0);
    let totalInputCosts = new Decimal(0);
    let totalExpenses   = new Decimal(0); // тільки CIT-deductible витрати

    // Інформаційні значення payroll-податків (вже сплачені через SALARY_PAYMENT)
    let infoEsvUah      = new Decimal(0);
    let infoPdfoUah     = new Decimal(0);
    let infoMilitaryUah = new Decimal(0);

    const esvRate      = new Decimal(String(TAX_RATES.ESV));
    const pitRate      = new Decimal(String(TAX_RATES.PIT));
    const militaryRate = new Decimal(String(TAX_RATES.MILITARY));
    const vatRate      = new Decimal(String(TAX_RATES.VAT));
    const citRate      = new Decimal(String(TAX_RATES.CIT));

    for (const tx of txns) {
      const amount = new Decimal(tx.amountUah.toString()).abs();

      // Доходи
      if (tx.type === 'NPC_SALE' || tx.type === 'MARKET_SALE') {
        totalRevenue = totalRevenue.plus(amount);
      }

      // Вхідний ПДВ (для відрахування)
      if (tx.type === 'MARKET_PURCHASE') {
        totalInputCosts = totalInputCosts.plus(amount);
      }

      // Витрати для CIT — тільки операційні, виключаємо TAX_PAYMENT і LOAN_REPAYMENT
      if (
        new Decimal(tx.amountUah.toString()).isNegative() &&
        CIT_DEDUCTIBLE_TYPES.has(tx.type)
      ) {
        totalExpenses = totalExpenses.plus(amount);
      }

      // SALARY_PAYMENT: відновлюємо gross для інформаційного звіту
      // Сума транзакції = gross × 1.22, тому gross = amount / 1.22
      if (tx.type === 'SALARY_PAYMENT') {
        const grossFromTx = amount.dividedBy('1.22');
        infoEsvUah      = infoEsvUah.plus(grossFromTx.times(esvRate));
        infoPdfoUah     = infoPdfoUah.plus(grossFromTx.times(pitRate));
        infoMilitaryUah = infoMilitaryUah.plus(grossFromTx.times(militaryRate));
      }
    }

    // ── ПДВ (net basis) ───────────────────────────────────────────────────
    // Ціни в грі — без ПДВ (B2B модель).
    // Вихідний ПДВ = виручка × 20 %
    // Вхідний ПДВ  = закупівлі × 20 % (відшкодовується)
    // До сплати     = max(0, вихідний − вхідний)
    const outputVAT = totalRevenue.times(vatRate);
    const inputVAT  = totalInputCosts.times(vatRate);
    const vatUah    = Decimal.max(new Decimal(0), outputVAT.minus(inputVAT));

    // ── Податок на прибуток ───────────────────────────────────────────────
    // База = max(0, виручка − деductible витрати)
    // TAX_PAYMENT та LOAN_REPAYMENT не включені в totalExpenses
    const taxableProfit = Decimal.max(new Decimal(0), totalRevenue.minus(totalExpenses));
    const citUah        = taxableProfit.times(citRate);

    // Поточний місяць: до сплати — тільки ПДВ + CIT
    const totalDue = vatUah.plus(citUah);

    const dueAt = new Date(periodEndDate.getTime() + 10 * 24 * 60 * 60 * 1000); // 10 ігро-днів

    const player        = await this.prisma.player.findUniqueOrThrow({ where: { id: playerId } });
    const balanceBefore = new Decimal(player.cashBalance.toString());
    const canPay        = balanceBefore.greaterThanOrEqualTo(totalDue);
    const balanceAfter  = canPay
      ? Decimal.max(new Decimal(0), balanceBefore.minus(totalDue))
      : balanceBefore;

    await this.prisma.$transaction([
      this.prisma.taxRecord.create({
        data: {
          playerId,
          periodStart:     periodStartDate,
          periodEnd:       periodEndDate,
          // Фактично нараховані (до сплати)
          vatUah,                             // Decimal ✓
          citUah,                             // Decimal ✓
          totalUah:        totalDue,          // Decimal ✓
          // Інформаційні (вже сплачені через SALARY_PAYMENT щодня)
          esvUah:          infoEsvUah,        // Decimal ✓
          pdfoUah:         infoPdfoUah,       // Decimal ✓
          militaryTaxUah:  infoMilitaryUah,   // Decimal ✓
          isPaid:          canPay,
          dueAt,
          paidAt:          canPay ? new Date() : null,
        },
      }),
      ...(canPay && totalDue.greaterThan(0)
        ? [
            this.prisma.player.update({
              where: { id: playerId },
              data:  { cashBalance: balanceAfter },      // Decimal ✓
            }),
            this.prisma.financialTransaction.create({
              data: {
                playerId,
                type:          'TAX_PAYMENT',
                amountUah:     totalDue.negated(),        // Decimal ✓
                balanceBefore,                            // Decimal ✓
                balanceAfter,                             // Decimal ✓
                description:
                  `Місячні податки тік ${tickNumber}: ` +
                  `ПДВ ₴${vatUah.toFixed(2)} + CIT ₴${citUah.toFixed(2)} = ₴${totalDue.toFixed(2)} ` +
                  `(інфо: ЄСВ ₴${infoEsvUah.toFixed(0)} ПДФО ₴${infoPdfoUah.toFixed(0)} ` +
                  `Вій ₴${infoMilitaryUah.toFixed(0)} — вже сплачені щодня)`,
                referenceId: tickNumber.toString(),
              },
            }),
          ]
        : []),
    ]);

    return {
      vatUah:         vatUah.toNumber(),
      citUah:         citUah.toNumber(),
      esvUah:         infoEsvUah.toNumber(),       // інформаційно
      pdfoUah:        infoPdfoUah.toNumber(),       // інформаційно
      militaryTaxUah: infoMilitaryUah.toNumber(),   // інформаційно
      totalUah:       totalDue.toNumber(),          // = ПДВ + CIT (без payroll)
    };
  }

  /**
   * Стягує несплачені прострочені ПДВ/CIT з пенею 0.1%/ігро-день.
   */
  async collectOverdueTaxes(playerId: string): Promise<void> {
    const overdue = await this.prisma.taxRecord.findMany({
      where:   { playerId, isPaid: false, dueAt: { lt: new Date() } },
      orderBy: { dueAt: 'asc' },
    });

    for (const record of overdue) {
      const daysOverdue = Math.floor(
        (Date.now() - record.dueAt.getTime()) / (1000 * 60 * 60 * 24),
      );

      const base     = new Decimal(record.totalUah.toString());
      if (base.lessThan('0.01')) continue; // записи з нульовим боргом пропускаємо

      // Пеня: 0.1% на день (ст. 129 ПКУ — реальна ставка 120% облікової ставки НБУ,
      // але 0.1%/день — гарне наближення для гри)
      const penalty  = base.times(new Decimal('0.001')).times(daysOverdue);
      const totalDue = base.plus(penalty);

      const player   = await this.prisma.player.findUniqueOrThrow({ where: { id: playerId } });
      const balance  = new Decimal(player.cashBalance.toString());
      if (balance.lessThan(totalDue)) continue;

      const balanceAfter = balance.minus(totalDue);

      await this.prisma.$transaction([
        this.prisma.taxRecord.update({
          where: { id: record.id },
          data:  { isPaid: true, paidAt: new Date() },
        }),
        this.prisma.player.update({
          where: { id: playerId },
          data:  { cashBalance: balanceAfter },          // Decimal ✓
        }),
        this.prisma.financialTransaction.create({
          data: {
            playerId,
            type:          'TAX_PAYMENT',
            amountUah:     totalDue.negated(),            // Decimal ✓
            balanceBefore: balance,                       // Decimal ✓
            balanceAfter,                                 // Decimal ✓
            description:
              `Прострочений ПДВ+CIT + пеня (${daysOverdue} дн.): ₴${totalDue.toFixed(2)} ` +
              `(борг ₴${base.toFixed(2)} + пеня ₴${penalty.toFixed(2)})`,
            referenceId: record.id,
          },
        }),
      ]);
    }
  }
}
