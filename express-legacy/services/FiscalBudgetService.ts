/**
 * FiscalBudgetService — центральне казначейство ігрової економіки.
 *
 * Три ключові функції:
 *
 *   collectTaxesAndAggregate()        — кожні 24 тики (TICKS_PER_SNAPSHOT)
 *     Агрегує TaxRecord всіх гравців у єдиний StateBudget-сінглтон.
 *     Виконується у Serializable-транзакції: паралельні нарахування податків
 *     не можуть перекрити один одного у момент підбиття підсумків.
 *
 *   applyForStateSubsidy()            — по запиту гравця (HTTP API)
 *     Перевіряє ComplianceScore ≥ 0.90, тип підприємства, відсутність
 *     повторної заявки; розраховує cashback від капітальних витрат;
 *     атомарно кредитує гравця, дебетує програмний пул і StateBudget.
 *
 *   calculateInflationAndTariffIndex() — кожні 30 тиків (TICKS_PER_MONTH)
 *     Якщо обсяг виданих субсидій перевищує ≥ 70% надходжень → дефіцит →
 *     тариф +2%, базова з/п +1%. Якщо ≤ 20% → профіцит → тариф −0.5%.
 *     Оновлює City.energyTariffUah та City.wageBaselineUah одним $executeRaw.
 *
 * Concurrency:
 *   Всі мутації StateBudget та SubsidyProgram (видача субсидій і агрегація)
 *   виконуються у Prisma.TransactionIsolationLevel.Serializable.
 *   PostgreSQL serializable SSI гарантує відсутність phantom reads та
 *   write skew навіть при масовому одночасному нарахуванні податків від
 *   сотень гравців.
 */

import { PrismaClient, Prisma, SubsidyType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

// ── Singleton id ──────────────────────────────────────────────────────────────
const BUDGET_ID = 'fiscal-budget-singleton';

// ── Порогові значення відповідності для субсидій ──────────────────────────────
const COMPLIANCE_THRESHOLD = 0.90;

// ── Допустимі типи підприємств по програмах ───────────────────────────────────
const PROGRAM_ENTERPRISE_TYPES: Record<string, string[]> = {
  AGRO_DEVELOPMENT:  ['AGRO_FARM', 'FOOD_PROCESSING'],
  GREEN_TRANSITION:  ['AGRO_FARM', 'TEXTILE_FACTORY', 'FOOD_PROCESSING', 'WAREHOUSE', 'LOGISTICS_HUB'],
  REGIONAL_STIMULUS: [],  // [] = будь-який тип
};

// ── Параметри інфляційного тиску ──────────────────────────────────────────────
const DEFICIT_THRESHOLD  = 0.70;   // субсидії > 70% доходів → дефіцит
const SURPLUS_THRESHOLD  = 0.20;   // субсидії < 20% доходів → профіцит
const TARIFF_FACTOR_DEFICIT  = new Decimal('1.020');  // +2.0%
const TARIFF_FACTOR_BALANCED = new Decimal('1.005');  // +0.5% (базова інфляція)
const TARIFF_FACTOR_SURPLUS  = new Decimal('0.995');  // −0.5%
const WAGE_FACTOR_DEFICIT    = new Decimal('1.010');  // +1.0%
const WAGE_FACTOR_NEUTRAL    = new Decimal('1.000');  // без змін

// Цінові кордони: запобігають від'ємним тарифам або ринковому колапсу
const MIN_TARIFF_UAH = new Decimal('1.50');
const MAX_TARIFF_UAH = new Decimal('15.00');
const MIN_WAGE_UAH   = new Decimal('8000');

// ── Початкові держпрограми ─────────────────────────────────────────────────────
interface ProgramSeed {
  type:               SubsidyType;
  subsidyPercentage:  number;
  availableFundsUah:  number;
  description:        string;
}

const DEFAULT_PROGRAMS: ProgramSeed[] = [
  {
    type:              'AGRO_DEVELOPMENT',
    subsidyPercentage: 0.25,
    availableFundsUah: 50_000_000,
    description:
      'Держпідтримка агросектору: 25% компенсація капітальних витрат на агровиробництво ' +
      'та харчову переробку. Аналог програми «Аграрний фонд» та 5-7-9% кредитів.',
  },
  {
    type:              'GREEN_TRANSITION',
    subsidyPercentage: 0.30,
    availableFundsUah: 30_000_000,
    description:
      '«Зелений перехід»: 30% cashback на обладнання з низьким енергоспоживанням, ' +
      'відновлювані активи та сертифіковані «зелені» технології. Аналог програм ЄБРР/USAID.',
  },
  {
    type:              'REGIONAL_STIMULUS',
    subsidyPercentage: 0.15,
    availableFundsUah: 20_000_000,
    description:
      'Регіональний грант: 15% субсидія капітальних витрат для будь-якого підприємства. ' +
      'Аналог програми «Велике будівництво» та регіонального розвитку ОТГ.',
  },
];

// ── Типи результатів ──────────────────────────────────────────────────────────

export interface TaxAggregationResult {
  tick:           bigint;
  periodFrom:     Date | null;
  newVatUah:      Decimal;
  newOpexTaxUah:  Decimal;
  newTotalUah:    Decimal;
  budgetBalance:  Decimal;  // totalRevenue − allocatedSubsidies
}

export interface SubsidyApplicationResult {
  programType:        string;
  baseCapexUah:       Decimal;
  subsidyAmountUah:   Decimal;
  playerBalanceAfter: Decimal;
}

export interface InflationAdjustmentResult {
  pressureCategory: 'DEFICIT' | 'BALANCED' | 'SURPLUS';
  tariffDeltaPct:   number;
  wageDeltaPct:     number;
  citiesUpdated:    number;
  newAvgTariffUah:  number;
}

// ═════════════════════════════════════════════════════════════════════════════

export class FiscalBudgetService {
  constructor(private readonly db: PrismaClient) {}

  // ══════════════════════════════════════════════════════════════════════════
  // 1. AGGREGATE TAXES INTO STATE BUDGET
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Сканує TaxRecord всіх гравців, створені після попередньої агрегації,
   * і переносить суму до StateBudget-сінглтону.
   *
   * Використовує $queryRaw + SUM щоб уникнути завантаження тисяч рядків
   * у пам'ять застосунку.
   *
   * Serializable isolation: якщо два екземпляри сервера запустять цей метод
   * одночасно (Vercel cold start race), PostgreSQL SSI виявить конфлікт і
   * відкотить один з них → клієнт отримає серіалізаційну помилку і може
   * повторити запит.
   */
  async collectTaxesAndAggregate(currentTick: bigint): Promise<TaxAggregationResult> {
    return this.db.$transaction(async tx => {

      // ── Читаємо поточний стан бюджету (або ініціалізуємо) ────────────────
      const existing = await tx.stateBudget.findUnique({ where: { id: BUDGET_ID } });
      const since    = existing?.lastAggregatedAt ?? new Date(0);

      // ── Агрегуємо TaxRecord за весь новий період одним SQL-запитом ───────
      // TaxRecord містить точний розбір: vatUah, citUah, esvUah, pdfoUah, militaryTaxUah.
      // esvUah, pdfoUah, militaryTaxUah — «інформаційні» поля (вже утримані з
      // брутто зарплатних виплат), але для держбюджету вони є реальними доходами.
      const rows = await tx.$queryRaw<Array<{
        vat_sum:      string;
        cit_sum:      string;
        esv_sum:      string;
        pdfo_sum:     string;
        military_sum: string;
      }>>`
        SELECT
          COALESCE(SUM("vatUah"),         0)::text AS vat_sum,
          COALESCE(SUM("citUah"),         0)::text AS cit_sum,
          COALESCE(SUM("esvUah"),         0)::text AS esv_sum,
          COALESCE(SUM("pdfoUah"),        0)::text AS pdfo_sum,
          COALESCE(SUM("militaryTaxUah"), 0)::text AS military_sum
        FROM "TaxRecord"
        WHERE "createdAt" > ${since}
      `;

      const row     = rows[0]!;
      const newVat  = new Decimal(row.vat_sum);
      const newOpex = new Decimal(row.cit_sum)
        .plus(row.esv_sum)
        .plus(row.pdfo_sum)
        .plus(row.military_sum);
      const newTotal = newVat.plus(newOpex);

      const now = new Date();

      const budget = await tx.stateBudget.upsert({
        where:  { id: BUDGET_ID },
        create: {
          id:                      BUDGET_ID,
          totalTaxRevenue:         newTotal,
          accumulatedPdv:          newVat,
          accumulatedOpexTaxes:    newOpex,
          allocatedSubsidiesTotal: new Decimal(0),
          lastAggregatedTick:      currentTick,
          lastAggregatedAt:        now,
        },
        update: {
          totalTaxRevenue:      { increment: newTotal },
          accumulatedPdv:       { increment: newVat  },
          accumulatedOpexTaxes: { increment: newOpex },
          lastAggregatedTick:   currentTick,
          lastAggregatedAt:     now,
        },
      });

      const budgetBalance = new Decimal(budget.totalTaxRevenue.toString())
        .minus(budget.allocatedSubsidiesTotal.toString());

      return {
        tick:          currentTick,
        periodFrom:    existing?.lastAggregatedAt ?? null,
        newVatUah:     newVat,
        newOpexTaxUah: newOpex,
        newTotalUah:   newTotal,
        budgetBalance,
      };

    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 2. STATE SUBSIDY APPLICATION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Верифікаційний двигун субсидій.
   *
   * Перевірки (у порядку виконання):
   *  1. ComplianceRecord.score ≥ 0.90 — лише прозорі платники
   *  2. Підприємство належить гравцю та є операційним
   *  3. Тип підприємства відповідає програмі
   *  4. Немає повторної заявки (@@unique playerId + enterpriseId + subsidyType)
   *  5. Програма існує та активна
   *  6. Базові капітальні витрати > 0
   *  7. У програмному пулі та держбюджеті достатньо коштів
   *
   * Виконання (Serializable tx):
   *  - cashback = baseCapex × subsidyPercentage
   *  - cashBalance гравця +cashback
   *  - SubsidyProgram.availableFundsUah −cashback
   *  - StateBudget.allocatedSubsidiesTotal +cashback
   *  - FinancialTransaction STATE_SUBSIDY
   *  - SubsidyApplication (охоронний запис)
   */
  async applyForStateSubsidy(
    playerId:     string,
    enterpriseId: string,
    programType:  string,
    currentTick:  bigint,
  ): Promise<SubsidyApplicationResult> {
    return this.db.$transaction(async tx => {

      // ── 1. Відповідність ─────────────────────────────────────────────────
      const compliance = await tx.complianceRecord.findUnique({ where: { playerId } });
      const score = compliance?.score ?? 0;
      if (score < COMPLIANCE_THRESHOLD) {
        throw new Error(
          `ComplianceScore ${score.toFixed(2)} нижче порогу ${COMPLIANCE_THRESHOLD}. ` +
          `Погасіть всі прострочені податки та штрафи.`,
        );
      }

      // ── 2. Перевірка підприємства ────────────────────────────────────────
      const enterprise = await tx.enterprise.findUniqueOrThrow({ where: { id: enterpriseId } });
      if (enterprise.playerId !== playerId) {
        throw new Error('Підприємство не належить цьому гравцю.');
      }
      if (!enterprise.isOperational) {
        throw new Error('Підприємство має бути операційним для отримання субсидії.');
      }

      // ── 3. Тип підприємства vs програма ─────────────────────────────────
      const eligible = PROGRAM_ENTERPRISE_TYPES[programType];
      if (eligible === undefined) {
        throw new Error(`Невідома субсидійна програма: ${programType}`);
      }
      if (eligible.length > 0 && !eligible.includes(enterprise.type)) {
        throw new Error(
          `Програма ${programType} підтримує: [${eligible.join(', ')}]. ` +
          `Ваш тип: ${enterprise.type}.`,
        );
      }

      // ── 4. Відсутність повторної заявки ──────────────────────────────────
      const existingApp = await tx.subsidyApplication.findUnique({
        where: {
          playerId_enterpriseId_subsidyType: {
            playerId,
            enterpriseId,
            subsidyType: programType as SubsidyType,
          },
        },
      });
      if (existingApp) {
        throw new Error(
          `Субсидія ${programType} для підприємства ${enterpriseId} вже була отримана.`,
        );
      }

      // ── 5. Програма активна ──────────────────────────────────────────────
      const program = await tx.subsidyProgram.findUnique({
        where: { type: programType as SubsidyType },
      });
      if (!program || !program.isActive) {
        throw new Error(`Програма ${programType} не активна або не ініціалізована.`);
      }

      // ── 6. Базові капітальні витрати (будівництво + обладнання) ─────────
      // Будівельні проекти: реальна вартість закінчених об'єктів
      const projects = await tx.constructionProject.findMany({
        where:  { enterpriseId, status: 'COMPLETED' },
        select: { totalCostUah: true },
      });

      // Обладнання: поточна балансова вартість (зменшується зі зносом)
      const eqRows = await tx.$queryRaw<Array<{ total: string }>>`
        SELECT COALESCE(SUM(e."marketValueUah"), 0)::text AS total
        FROM   "Equipment"  e
        JOIN   "Workshop"   w ON w.id = e."workshopId"
        WHERE  w."enterpriseId" = ${enterpriseId}
      `;

      const constructionTotal = projects.reduce(
        (s, p) => s.plus(p.totalCostUah.toString()),
        new Decimal(0),
      );
      const equipmentTotal = new Decimal(eqRows[0]!.total);
      const baseCapex      = constructionTotal.plus(equipmentTotal);

      if (baseCapex.lessThan('1')) {
        throw new Error(
          'Підприємство не має зареєстрованих капітальних витрат для субсидіювання.',
        );
      }

      // ── 7. Перевірка пулу програми та держбюджету ────────────────────────
      const subsidyAmount  = baseCapex.times(program.subsidyPercentage);
      const availableFunds = new Decimal(program.availableFundsUah.toString());

      if (availableFunds.lessThan(subsidyAmount)) {
        throw new Error(
          `Програма ${programType}: залишок ₴${availableFunds.toFixed(0)}, ` +
          `запитано ₴${subsidyAmount.toFixed(0)}. Фонд вичерпано на цей цикл.`,
        );
      }

      const budget = await tx.stateBudget.findUnique({ where: { id: BUDGET_ID } });
      if (budget) {
        const netBalance = new Decimal(budget.totalTaxRevenue.toString())
          .minus(budget.allocatedSubsidiesTotal.toString());
        if (netBalance.lessThan(subsidyAmount)) {
          throw new Error(
            `Держбюджет: нетто-залишок ₴${netBalance.toFixed(0)} < ₴${subsidyAmount.toFixed(0)}. ` +
            `Зачекайте наступного циклу агрегації податків.`,
          );
        }
      }

      // ── 8. Атомарне виконання ────────────────────────────────────────────
      const player        = await tx.player.findUniqueOrThrow({ where: { id: playerId } });
      const balanceBefore = new Decimal(player.cashBalance.toString());
      const balanceAfter  = balanceBefore.plus(subsidyAmount);

      await tx.player.update({
        where: { id: playerId },
        data:  { cashBalance: { increment: subsidyAmount } },
      });

      await tx.subsidyProgram.update({
        where: { type: programType as SubsidyType },
        data:  { availableFundsUah: { decrement: subsidyAmount } },
      });

      if (budget) {
        await tx.stateBudget.update({
          where: { id: BUDGET_ID },
          data:  { allocatedSubsidiesTotal: { increment: subsidyAmount } },
        });
      }

      await tx.financialTransaction.create({
        data: {
          playerId,
          type:          'STATE_SUBSIDY',
          amountUah:     subsidyAmount,         // позитивне: приток
          balanceBefore,
          balanceAfter,
          description:
            `Держсубсидія [${programType}]: +₴${subsidyAmount.toFixed(0)} ` +
            `(${(program.subsidyPercentage * 100).toFixed(0)}% від капітальних витрат ` +
            `₴${baseCapex.toFixed(0)} по підприємству "${enterprise.name}")`,
          referenceId: enterpriseId,
        },
      });

      await tx.subsidyApplication.create({
        data: {
          playerId,
          enterpriseId,
          programId:       program.id,
          subsidyType:     programType as SubsidyType,
          baseCapexUah:    baseCapex,
          subsidyAmountUah: subsidyAmount,
          appliedAtTick:   currentTick,
        },
      });

      return {
        programType,
        baseCapexUah:       baseCapex,
        subsidyAmountUah:   subsidyAmount,
        playerBalanceAfter: balanceAfter,
      };

    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 3. INFLATION & TARIFF INDEX
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Симулює макроекономічний зворотній зв'язок між держвидатками та цінами.
   *
   * Логіка фіскального тиску:
   *   subsidyBurden = allocatedSubsidiesTotal / totalTaxRevenue
   *
   *   ≥ 0.70 (DEFICIT):
   *     Держава «роздає» більше ніж збирає → попит-сайд інфляція.
   *     Тариф на електрику: ×1.020 (+2%), базова з/п: ×1.010 (+1%)
   *
   *   0.20–0.70 (BALANCED):
   *     Помірна ділова активність → базова інфляція.
   *     Тариф: ×1.005 (+0.5%), з/п: без змін
   *
   *   ≤ 0.20 (SURPLUS):
   *     Сильна податкова база, низькі субсидії → дефляційний тиск.
   *     Тариф: ×0.995 (−0.5%), з/п: без змін
   *
   * Застосовується одним UPDATE до всіх міст із GREATEST/LEAST кордонами:
   *   energyTariffUah ∈ [1.50, 15.00] UAH/кВт·год
   *   wageBaselineUah ≥ 8 000 UAH/міс
   */
  async calculateInflationAndTariffIndex(): Promise<InflationAdjustmentResult> {
    const budget = await this.db.stateBudget.findUnique({ where: { id: BUDGET_ID } });

    if (!budget || new Decimal(budget.totalTaxRevenue.toString()).isZero()) {
      return {
        pressureCategory: 'BALANCED',
        tariffDeltaPct:   0,
        wageDeltaPct:     0,
        citiesUpdated:    0,
        newAvgTariffUah:  0,
      };
    }

    const revenue        = new Decimal(budget.totalTaxRevenue.toString());
    const subsidies      = new Decimal(budget.allocatedSubsidiesTotal.toString());
    const subsidyBurden  = subsidies.dividedBy(revenue).toNumber();

    let pressureCategory: 'DEFICIT' | 'BALANCED' | 'SURPLUS';
    let tariffFactor: Decimal;
    let wageFactor:   Decimal;

    if (subsidyBurden >= DEFICIT_THRESHOLD) {
      pressureCategory = 'DEFICIT';
      tariffFactor     = TARIFF_FACTOR_DEFICIT;
      wageFactor       = WAGE_FACTOR_DEFICIT;
    } else if (subsidyBurden <= SURPLUS_THRESHOLD) {
      pressureCategory = 'SURPLUS';
      tariffFactor     = TARIFF_FACTOR_SURPLUS;
      wageFactor       = WAGE_FACTOR_NEUTRAL;
    } else {
      pressureCategory = 'BALANCED';
      tariffFactor     = TARIFF_FACTOR_BALANCED;
      wageFactor       = WAGE_FACTOR_NEUTRAL;
    }

    // Один UPDATE для всіх міст зі збереженням кордонів
    await this.db.$executeRaw`
      UPDATE "City"
      SET
        "energyTariffUah" = GREATEST(
          ${MIN_TARIFF_UAH}::numeric,
          LEAST(${MAX_TARIFF_UAH}::numeric, "energyTariffUah" * ${tariffFactor}::numeric)
        ),
        "wageBaselineUah" = GREATEST(
          ${MIN_WAGE_UAH}::numeric,
          "wageBaselineUah" * ${wageFactor}::numeric
        )
    `;

    const [cityCount, avgRow] = await Promise.all([
      this.db.city.count(),
      this.db.$queryRaw<Array<{ avg: string }>>`
        SELECT AVG("energyTariffUah")::text AS avg FROM "City"
      `,
    ]);

    return {
      pressureCategory,
      tariffDeltaPct:  (tariffFactor.toNumber() - 1) * 100,
      wageDeltaPct:    (wageFactor.toNumber()   - 1) * 100,
      citiesUpdated:   cityCount,
      newAvgTariffUah: parseFloat(avgRow[0]?.avg ?? '0'),
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 4. SEED (idempotent)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Ініціалізує три держпрограми субсидій при першому запуску.
   * Безпечно викликати повторно — upsert не перезаписує existingFields.
   */
  async seedSubsidyPrograms(): Promise<void> {
    for (const prog of DEFAULT_PROGRAMS) {
      await this.db.subsidyProgram.upsert({
        where:  { type: prog.type },
        create: {
          type:               prog.type,
          isActive:           true,
          availableFundsUah:  new Decimal(prog.availableFundsUah),
          subsidyPercentage:  prog.subsidyPercentage,
          description:        prog.description,
          enterpriseTypes:    JSON.stringify(PROGRAM_ENTERPRISE_TYPES[prog.type] ?? []),
          minComplianceScore: COMPLIANCE_THRESHOLD,
        },
        update: {},  // не перезаписуємо availableFundsUah: кошти змінюються в грі
      });
    }
  }
}
