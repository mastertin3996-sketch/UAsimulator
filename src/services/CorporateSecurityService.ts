/**
 * CorporateSecurityService — корпоративна безпека, захист інтелектуальної власності
 * та правовий захист активів.
 *
 * ── Три рівні ─────────────────────────────────────────────────────────────────
 *
 *   Defense Score (оцінка захищеності):
 *     calculateSecurityDefenseScore(playerId, enterpriseId)
 *       → float 0.0–1.0; визначає ризик штрафів при аудитах і корпоративних атаках
 *
 *   Судочинство (патентний позов):
 *     filePatentLawsuit(plaintiffId, defendantId, technologyCode)
 *       → суд порівнює суму ефективностей адвокатів; переможець отримує/уникає штрафу
 *
 *   Глобальний тіковий крок:
 *     processSecurityTick(currentTick)
 *       → утримання SecuritySystem, перевірка умов «ворожого арешту активів»,
 *          автоматичне зняття арешту при нормалізації стану
 *
 * ── Формула Defense Score ─────────────────────────────────────────────────────
 *
 *   DefenseScore = (secLevel/5 × 0.40)
 *                + (min(1, Σ lawyerEfficiency / LAWYER_NORM) × 0.40)
 *                + (ComplianceScore × 0.20)
 *
 *   secLevel       = SecuritySystem.securityLevel (1–5); 0 якщо системи немає
 *   lawyerEfficiency = sum(Employee.efficiency) для всіх LAWYER підприємства
 *   LAWYER_NORM     = 5.0 (5 повноефективних адвокатів = максимум)
 *   ComplianceScore = ComplianceRecord.score (0.0–1.0)
 *
 * ── Патентний суд (court simulation) ─────────────────────────────────────────
 *
 *   plaintiffScore = Σ efficiency (LAWYER) по всіх підприємствах позивача
 *   defendantScore = аналогічно для відповідача
 *   winProbability = plaintiffScore / max(plaintiffScore + defendantScore, 0.01)
 *
 *   Вигода відповідача:
 *     benefitUah = Technology.requiredResearchPoints × RP_BENEFIT_PER_POINT (₴1 000/RP)
 *   Штраф при програші:
 *     penaltyUah = benefitUah × PENALTY_MULTIPLIER (3.0 = 300%)
 *
 * ── Ворожий арест активів (Hostile Asset Freeze) ─────────────────────────────
 *
 *   Умова тригера: ComplianceScore < 0.5 AND є кредити зі статусом DEFAULTED
 *   Ефект: усі підприємства гравця → isLegallyFrozen = true
 *          B2B-ордери + логістика блокуються на рівні відповідних сервісів
 *   Витрати: одноразовий суд.збір ₴100 000
 *   Зняття: auto-unfreeze якщо ComplianceScore ≥ 0.5 AND немає DEFAULTED кредитів
 */

import { PrismaClient } from '@prisma/client';
import { Decimal }      from '@prisma/client/runtime/library';

// ── Формула Defense Score ─────────────────────────────────────────────────────
const SECURITY_LEVEL_WEIGHT  = 0.40;
const LAWYER_WEIGHT          = 0.40;
const COMPLIANCE_WEIGHT      = 0.20;
const SECURITY_LEVEL_MAX     = 5;
const LAWYER_NORMALIZATION   = 5.0;   // 5 lawyers @ 1.0 efficiency = max

// ── Суд ──────────────────────────────────────────────────────────────────────
const RP_BENEFIT_PER_POINT = new Decimal('1000');   // ₴1 000 за одиницю R&D
const PENALTY_MULTIPLIER   = 3.0;                   // 300% від вигоди
const PATENT_FEE_UAH       = new Decimal('200000'); // ₴200 000 реєстраційне мито

// ── Ворожий арест ─────────────────────────────────────────────────────────────
const COMPLIANCE_FREEZE_THRESHOLD  = 0.5;
const HOSTILE_FREEZE_COURT_FEE_UAH = new Decimal('100000');  // ₴100 000 судові витрати
const LEGAL_FREEZE_REASON          = 'COURT_ASSET_FREEZE';

// ── SecuritySystem CAPEX/upkeep (₴/місяць) за рівнями ────────────────────────
const SECURITY_MONTHLY_UPKEEP: Record<number, Decimal> = {
  1: new Decimal('15000'),   // базовий: 1–2 охоронці + CCTV
  2: new Decimal('30000'),   // підвищений: 3–4 охоронці + сигналізація
  3: new Decimal('55000'),   // середній: 5–6 охоронців + контроль доступу
  4: new Decimal('90000'),   // високий: 8+ охоронців + периметр
  5: new Decimal('150000'),  // максимальний: SECURITY_OFFICER + інтегрована система
};

const SECURITY_INSTALL_CAPEX: Record<number, Decimal> = {
  1: new Decimal('50000'),
  2: new Decimal('120000'),
  3: new Decimal('250000'),
  4: new Decimal('450000'),
  5: new Decimal('800000'),
};

const TICKS_PER_MONTH = 30n;

// ── Типи результатів ──────────────────────────────────────────────────────────

export interface DefenseScoreBreakdown {
  enterpriseId:        string;
  totalDefenseScore:   number;   // 0.0–1.0
  components: {
    securityLevelNorm: number;   // secLevel/5 × 0.40
    lawyerNorm:        number;   // normalized lawyer score × 0.40
    complianceNorm:    number;   // complianceScore × 0.20
  };
  raw: {
    securityLevel:        number;
    lawyerCount:          number;
    totalLawyerEfficiency: number;
    complianceScore:      number;
  };
}

export interface LawsuitResult {
  legalActionId:   string;
  outcome:         'PLAINTIFF_WON' | 'DEFENDANT_WON';
  plaintiffScore:  number;
  defendantScore:  number;
  winProbability:  number;
  benefitUah:      Decimal;
  penaltyUah:      Decimal;
  description:     string;
}

export interface SecurityTickSummary {
  tick:                bigint;
  systemsCharged:      number;
  totalMaintenanceUah: Decimal;
  newFreezes:          number;
  liftedFreezes:       number;
  totalFrozenCount:    number;
}

// ═════════════════════════════════════════════════════════════════════════════

export class CorporateSecurityService {
  constructor(private readonly db: PrismaClient) {}

  // ══════════════════════════════════════════════════════════════════════════
  // DEFENSE SCORE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Обчислює Defense Score для підприємства за формулою:
   *
   *   DefScore = (secLevel/5 × 0.40)
   *            + (min(1, ΣlawyerEff/5) × 0.40)
   *            + (complianceScore × 0.20)
   *
   * Якщо SecuritySystem відсутня → securityLevel = 0.
   * Якщо ComplianceRecord відсутній → complianceScore = 1.0 (новий гравець).
   */
  async calculateSecurityDefenseScore(
    playerId:     string,
    enterpriseId: string,
  ): Promise<DefenseScoreBreakdown> {
    const [secSystem, lawyers, compliance] = await Promise.all([
      this.db.securitySystem.findUnique({
        where:  { enterpriseId },
        select: { securityLevel: true, guardCount: true, isActive: true },
      }),
      this.db.employee.findMany({
        where:  { enterpriseId, profession: 'LAWYER', isOnStrike: false },
        select: { efficiency: true },
      }),
      this.db.complianceRecord.findUnique({
        where:  { playerId },
        select: { score: true },
      }),
    ]);

    // ── Компоненти ────────────────────────────────────────────────────────
    const securityLevel       = (secSystem?.isActive ? secSystem.securityLevel : 0);
    const totalLawyerEff      = lawyers.reduce((sum, l) => sum + l.efficiency, 0);
    const lawyerNormalized    = Math.min(1.0, totalLawyerEff / LAWYER_NORMALIZATION);
    const complianceScore     = compliance?.score ?? 1.0;

    const secComponent        = (securityLevel / SECURITY_LEVEL_MAX) * SECURITY_LEVEL_WEIGHT;
    const lawyerComponent     = lawyerNormalized * LAWYER_WEIGHT;
    const complianceComponent = complianceScore * COMPLIANCE_WEIGHT;

    const totalDefenseScore = Math.min(1.0, secComponent + lawyerComponent + complianceComponent);

    return {
      enterpriseId,
      totalDefenseScore,
      components: {
        securityLevelNorm: secComponent,
        lawyerNorm:        lawyerComponent,
        complianceNorm:    complianceComponent,
      },
      raw: {
        securityLevel,
        lawyerCount:           lawyers.length,
        totalLawyerEfficiency: totalLawyerEff,
        complianceScore,
      },
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ПАТЕНТ: реєстрація
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Реєструє патент на вже розроблену технологію.
   *
   * Умови:
   *   1. Гравець розблокував технологію (PlayerTechnology.isUnlocked = true)
   *   2. Патент ще не зареєстрований цим гравцем для цієї технології
   *   3. На балансі гравця ≥ ₴200 000 реєстраційного мита
   */
  async registerPatent(
    playerId:       string,
    technologyCode: string,
    currentTick:    bigint,
  ): Promise<{ patentId: string; technologyCode: string; feeUah: Decimal }> {
    // Перевіряємо, чи технологія розблокована
    const tech = await this.db.technology.findUniqueOrThrow({ where: { code: technologyCode as never } });

    const playerTech = await this.db.playerTechnology.findFirst({
      where: { playerId, technologyId: tech.id, isUnlocked: true },
    });
    if (!playerTech) {
      throw new Error(
        `Технологія "${technologyCode}" не розблокована. Спочатку завершіть дослідження.`,
      );
    }

    // Перевіряємо дублікат патенту
    const existing = await this.db.patent.findUnique({
      where: { playerId_technologyCode: { playerId, technologyCode } },
    });
    if (existing?.isActive) {
      throw new Error(`Патент на "${technologyCode}" вже зареєстровано вами.`);
    }

    // Перевіряємо баланс
    const player  = await this.db.player.findUniqueOrThrow({ where: { id: playerId } });
    const balance = new Decimal(player.cashBalance.toString());
    if (balance.lessThan(PATENT_FEE_UAH)) {
      throw new Error(
        `Недостатньо коштів для реєстрації патенту: ` +
        `потрібно ₴${PATENT_FEE_UAH.toFixed(0)}, маєте ₴${balance.toFixed(0)}.`,
      );
    }

    const newBalance = balance.minus(PATENT_FEE_UAH);

    return this.db.$transaction(async tx => {
      const patent = await tx.patent.upsert({
        where:  { playerId_technologyCode: { playerId, technologyCode } },
        create: { playerId, technologyCode, registeredAtTick: currentTick },
        update: { isActive: true, registeredAtTick: currentTick },
      });

      await tx.player.update({
        where: { id: playerId },
        data:  { cashBalance: newBalance },
      });

      await tx.financialTransaction.create({
        data: {
          playerId,
          type:          'PATENT_REGISTRATION_FEE',
          amountUah:     PATENT_FEE_UAH.negated(),
          balanceBefore: balance,
          balanceAfter:  newBalance,
          description:   `Реєстрація патенту: "${technologyCode}" (тік ${currentTick})`,
          referenceId:   patent.id,
        },
      });

      return { patentId: patent.id, technologyCode, feeUah: PATENT_FEE_UAH };
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // СУДОВИЙ ПОЗОВ ЗА ПОРУШЕННЯ ПАТЕНТУ
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Подає патентний позов від plaintiffId проти defendantId за technologyCode.
   *
   * Передумови:
   *   1. Позивач має активний Patent(technologyCode)
   *   2. Відповідач має PlayerTechnology.isUnlocked = true для тієї ж технології
   *   3. Не існує активного позову між ними по тій же технології
   *   4. Позивач ≠ відповідач
   *
   * Суд (Serializable-транзакція):
   *   - Порівнюємо суму ефективностей адвокатів (LAWYER) обох сторін
   *   - winProbability = plaintiffScore / (plaintiffScore + defendantScore + ε)
   *   - Результат визначається Math.random() < winProbability
   *   - При перемозі позивача:
   *       penaltyUah = tech.requiredResearchPoints × 1 000 × 3.0
   *       Списуємо з відповідача, зараховуємо позивачу
   */
  async filePatentLawsuit(
    plaintiffId:    string,
    defendantId:    string,
    technologyCode: string,
    currentTick:    bigint,
  ): Promise<LawsuitResult> {
    if (plaintiffId === defendantId) {
      throw new Error('Гравець не може подати позов проти себе.');
    }

    // ── Передумови ────────────────────────────────────────────────────────
    const [patent, tech] = await Promise.all([
      this.db.patent.findUnique({
        where: { playerId_technologyCode: { playerId: plaintiffId, technologyCode } },
      }),
      this.db.technology.findUnique({ where: { code: technologyCode as never } }),
    ]);

    if (!patent?.isActive) {
      throw new Error(
        `Позивач не має активного патенту на "${technologyCode}". ` +
        `Спочатку зареєструйте патент через registerPatent().`,
      );
    }
    if (!tech) {
      throw new Error(`Технологія "${technologyCode}" не знайдена в каталозі.`);
    }

    const defendantTech = await this.db.playerTechnology.findFirst({
      where: {
        playerId:    defendantId,
        technologyId: tech.id,
        isUnlocked:  true,
      },
    });
    if (!defendantTech) {
      throw new Error(
        `Відповідач не використовує технологію "${technologyCode}". ` +
        `Позов можна подати лише проти гравця з розблокованою технологією.`,
      );
    }

    // Перевіряємо відсутність дублікату позову
    const activeLawsuit = await this.db.legalAction.findFirst({
      where: {
        plaintiffId,
        defendantId,
        technologyCode,
        status: { not: 'DEFENDANT_WON' }, // дозволяємо повторний позов після програшу
      },
    });
    if (activeLawsuit) {
      throw new Error(
        `Позов проти цього гравця щодо "${technologyCode}" вже існує ` +
        `(id: ${activeLawsuit.id}, статус: ${activeLawsuit.status}).`,
      );
    }

    // ── Розрахунок сил адвокатів ──────────────────────────────────────────
    const [plaintiffScore, defendantScore] = await Promise.all([
      this.aggregateLawyerScore(plaintiffId),
      this.aggregateLawyerScore(defendantId),
    ]);

    const winProbability = plaintiffScore / Math.max(plaintiffScore + defendantScore, 0.01);
    const plaintiffWins  = Math.random() < winProbability;

    // ── Фінансова вигода та штраф ─────────────────────────────────────────
    const benefitUah = new Decimal(tech.requiredResearchPoints.toString())
      .times(RP_BENEFIT_PER_POINT);
    const penaltyUah = plaintiffWins
      ? benefitUah.times(PENALTY_MULTIPLIER)
      : new Decimal(0);

    const outcome: 'PLAINTIFF_WON' | 'DEFENDANT_WON' = plaintiffWins
      ? 'PLAINTIFF_WON'
      : 'DEFENDANT_WON';

    const description = plaintiffWins
      ? `Позивач переміг (сила адвокатів ${plaintiffScore.toFixed(2)} vs ${defendantScore.toFixed(2)}). ` +
        `Штраф ₴${penaltyUah.toFixed(0)} = 300% від вигоди ₴${benefitUah.toFixed(0)}.`
      : `Відповідач відстояв позицію (адвокати ${defendantScore.toFixed(2)} vs ${plaintiffScore.toFixed(2)}). ` +
        `Позов "${technologyCode}" відхилено.`;

    // ── Серіалізована транзакція ──────────────────────────────────────────
    const legalAction = await this.db.$transaction(async tx => {
      if (plaintiffWins) {
        const [defendant, plaintiff] = await Promise.all([
          tx.player.findUniqueOrThrow({ where: { id: defendantId } }),
          tx.player.findUniqueOrThrow({ where: { id: plaintiffId } }),
        ]);

        const defBefore  = new Decimal(defendant.cashBalance.toString());
        const defAfter   = Decimal.max(new Decimal(0), defBefore.minus(penaltyUah));
        const plBefore   = new Decimal(plaintiff.cashBalance.toString());
        const plAfter    = plBefore.plus(penaltyUah);

        const actualPenalty = defBefore.minus(defAfter);  // може бути < penaltyUah якщо банкрот

        await tx.player.update({ where: { id: defendantId }, data: { cashBalance: defAfter } });
        await tx.player.update({ where: { id: plaintiffId }, data: { cashBalance: plAfter } });

        await tx.financialTransaction.create({
          data: {
            playerId:      defendantId,
            type:          'COURT_PENALTY_DEBIT',
            amountUah:     actualPenalty.negated(),
            balanceBefore: defBefore,
            balanceAfter:  defAfter,
            description:   `Судовий штраф: програш справи "${technologyCode}" — ₴${actualPenalty.toFixed(0)}`,
            referenceId:   plaintiffId,
          },
        });

        await tx.financialTransaction.create({
          data: {
            playerId:      plaintiffId,
            type:          'COURT_PENALTY_CREDIT',
            amountUah:     actualPenalty,
            balanceBefore: plBefore,
            balanceAfter:  plAfter,
            description:   `Патентний виграш "${technologyCode}": отримано ₴${actualPenalty.toFixed(0)}`,
            referenceId:   defendantId,
          },
        });
      }

      return tx.legalAction.create({
        data: {
          plaintiffId,
          defendantId,
          technologyCode,
          status:               outcome,
          plaintiffLawyerScore: plaintiffScore,
          defendantLawyerScore: defendantScore,
          benefitUah,
          penaltyUah,
          description,
          resolvedAtTick: currentTick,
        },
      });
    }, { isolationLevel: 'Serializable' });

    return {
      legalActionId:  legalAction.id,
      outcome,
      plaintiffScore,
      defendantScore,
      winProbability,
      benefitUah,
      penaltyUah,
      description,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ВСТАНОВЛЕННЯ СИСТЕМИ БЕЗПЕКИ
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Встановлює або оновлює SecuritySystem для підприємства.
   *
   * Рівні 1–5; апгрейд сплачує різницю CAPEX між рівнями.
   * Повна заміна: сплачує повний CAPEX нового рівня.
   */
  async installSecuritySystem(
    playerId:     string,
    enterpriseId: string,
    level:        number,
    currentTick:  bigint,
  ): Promise<{ systemId: string; level: number; capexUah: Decimal; monthlyUah: Decimal }> {
    if (level < 1 || level > 5 || !Number.isInteger(level)) {
      throw new Error('Рівень безпеки має бути цілим числом від 1 до 5.');
    }

    const enterprise = await this.db.enterprise.findUniqueOrThrow({
      where:   { id: enterpriseId },
      include: { securitySystem: true },
    });
    if (enterprise.playerId !== playerId) {
      throw new Error('Підприємство не належить цьому гравцю.');
    }
    if (!enterprise.isOperational) {
      throw new Error('Підприємство ще не введено в експлуатацію.');
    }

    const existing     = enterprise.securitySystem;
    const existingLevel = existing?.securityLevel ?? 0;

    if (existingLevel >= level) {
      throw new Error(
        `Поточний рівень безпеки (${existingLevel}) вже ≥ запитаного (${level}).`,
      );
    }

    // CAPEX = різниця між новим і старим рівнем (або повний, якщо нова система)
    const newCapex  = SECURITY_INSTALL_CAPEX[level]!;
    const oldCapex  = existingLevel > 0 ? SECURITY_INSTALL_CAPEX[existingLevel]! : new Decimal(0);
    const deltaCapex = newCapex.minus(oldCapex);

    const player  = await this.db.player.findUniqueOrThrow({ where: { id: playerId } });
    const balance = new Decimal(player.cashBalance.toString());
    if (balance.lessThan(deltaCapex)) {
      throw new Error(
        `Недостатньо коштів: потрібно ₴${deltaCapex.toFixed(0)}, маєте ₴${balance.toFixed(0)}.`,
      );
    }

    const monthlyUpkeep = SECURITY_MONTHLY_UPKEEP[level]!;
    const newBalance    = balance.minus(deltaCapex);

    const system = await this.db.$transaction(async tx => {
      const s = await tx.securitySystem.upsert({
        where:  { enterpriseId },
        create: {
          enterpriseId,
          playerId,
          securityLevel:    level,
          guardCount:       level * 2,
          monthlyUpkeepUah: monthlyUpkeep,
          installedAtTick:  currentTick,
        },
        update: {
          securityLevel:    level,
          guardCount:       level * 2,
          monthlyUpkeepUah: monthlyUpkeep,
        },
      });

      await tx.player.update({
        where: { id: playerId },
        data:  { cashBalance: newBalance },
      });

      await tx.financialTransaction.create({
        data: {
          playerId,
          type:          'EQUIPMENT_PURCHASE',
          amountUah:     deltaCapex.negated(),
          balanceBefore: balance,
          balanceAfter:  newBalance,
          description:
            `SecuritySystem рівень ${level} для «${enterprise.name}» ` +
            `(CAPEX Δ₴${deltaCapex.toFixed(0)}, утримання ₴${monthlyUpkeep.toFixed(0)}/міс)`,
          referenceId:   enterpriseId,
        },
      });

      return s;
    });

    return {
      systemId:   system.id,
      level,
      capexUah:   deltaCapex,
      monthlyUah: monthlyUpkeep,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ГЛОБАЛЬНИЙ ТІКОВИЙ КРОК
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Виконується щотік у TickEngine (глобально):
   *
   *   1. Нараховує тікову частку утримання SecuritySystem (monthlyUpkeep / 30)
   *   2. Перевіряє умови «Ворожого Арешту Активів»:
   *      ComplianceScore < 0.5 AND є кредити DEFAULTED
   *      → заморожує всі підприємства гравця, стягує суд.збір ₴100 000
   *   3. Автоматично знімає арешт якщо умови більше не виконуються
   */
  async processSecurityTick(currentTick: bigint): Promise<SecurityTickSummary> {
    const summary: SecurityTickSummary = {
      tick:                currentTick,
      systemsCharged:      0,
      totalMaintenanceUah: new Decimal(0),
      newFreezes:          0,
      liftedFreezes:       0,
      totalFrozenCount:    0,
    };

    // ── 1. Утримання SecuritySystem ───────────────────────────────────────
    const activeSystems = await this.db.securitySystem.findMany({
      where: { isActive: true },
      include: {
        player: { select: { cashBalance: true } },
      },
    });

    for (const sys of activeSystems) {
      const tickFee  = new Decimal(sys.monthlyUpkeepUah.toString())
        .dividedBy(Number(TICKS_PER_MONTH));
      const balance  = new Decimal(sys.player.cashBalance.toString());
      const newBal   = Decimal.max(new Decimal(0), balance.minus(tickFee));
      const charged  = balance.minus(newBal);

      if (charged.lessThanOrEqualTo('0.01')) continue;

      await this.db.$transaction([
        this.db.player.update({
          where: { id: sys.playerId },
          data:  { cashBalance: newBal },
        }),
        this.db.financialTransaction.create({
          data: {
            playerId:      sys.playerId,
            type:          'SECURITY_MAINTENANCE',
            amountUah:     charged.negated(),
            balanceBefore: balance,
            balanceAfter:  newBal,
            description:
              `Security L${sys.securityLevel} утримання ` +
              `(₴${charged.toFixed(2)}/тік) тік ${currentTick}`,
            referenceId:   sys.enterpriseId,
          },
        }),
      ]);

      summary.systemsCharged++;
      summary.totalMaintenanceUah = summary.totalMaintenanceUah.plus(charged);
    }

    // ── 2. Перевірка ворожого арешту ─────────────────────────────────────
    const allPlayers = await this.db.player.findMany({
      where: { isBankrupt: false },
      select: { id: true },
    });

    for (const { id: playerId } of allPlayers) {
      const [compliance, defaultedLoans] = await Promise.all([
        this.db.complianceRecord.findUnique({
          where:  { playerId },
          select: { score: true },
        }),
        this.db.loan.findFirst({
          where:  { playerId, status: 'DEFAULTED' },
          select: { id: true },
        }),
      ]);

      const score          = compliance?.score ?? 1.0;
      const hasDefaulted   = defaultedLoans !== null;
      const shouldFreeze   = score < COMPLIANCE_FREEZE_THRESHOLD && hasDefaulted;

      // Перевіряємо поточний стан заморозки підприємств
      const frozenEnts = await this.db.enterprise.findMany({
        where: { playerId, isLegallyFrozen: true, legalFreezeReason: LEGAL_FREEZE_REASON },
        select: { id: true },
      });

      if (shouldFreeze && frozenEnts.length === 0) {
        // Новий арест — заморожуємо всі підприємства
        await this.triggerHostileAssetFreeze(playerId, currentTick);
        summary.newFreezes++;
      } else if (!shouldFreeze && frozenEnts.length > 0) {
        // Умови зникли — знімаємо арест
        await this.liftHostileAssetFreeze(playerId);
        summary.liftedFreezes += frozenEnts.length;
      }
    }

    // ── 3. Загальна кількість заморожених підприємств ─────────────────────
    summary.totalFrozenCount = await this.db.enterprise.count({
      where: { isLegallyFrozen: true, legalFreezeReason: LEGAL_FREEZE_REASON },
    });

    return summary;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ПРИВАТНЕ
  // ══════════════════════════════════════════════════════════════════════════

  /** Сумарна ефективність усіх адвокатів гравця по всіх підприємствах. */
  private async aggregateLawyerScore(playerId: string): Promise<number> {
    const lawyers = await this.db.employee.findMany({
      where:  { playerId, profession: 'LAWYER', isOnStrike: false },
      select: { efficiency: true },
    });
    return lawyers.reduce((sum, l) => sum + l.efficiency, 0);
  }

  /**
   * Накладає судовий арешт: заморожує всі підприємства гравця,
   * стягує одноразовий суд.збір ₴100 000.
   */
  private async triggerHostileAssetFreeze(playerId: string, currentTick: bigint): Promise<void> {
    const player  = await this.db.player.findUniqueOrThrow({ where: { id: playerId } });
    const balance = new Decimal(player.cashBalance.toString());
    const fee     = Decimal.min(HOSTILE_FREEZE_COURT_FEE_UAH, balance); // не заходимо в мінус
    const newBal  = balance.minus(fee);

    await this.db.$transaction(async tx => {
      // Заморожуємо всі операційні підприємства
      await tx.enterprise.updateMany({
        where: { playerId, isOperational: true, isLegallyFrozen: false },
        data: {
          isLegallyFrozen:   true,
          legalFreezeReason: LEGAL_FREEZE_REASON,
        },
      });

      // Стягуємо суд.збір
      if (fee.greaterThan('0.01')) {
        await tx.player.update({
          where: { id: playerId },
          data:  { cashBalance: newBal },
        });

        await tx.financialTransaction.create({
          data: {
            playerId,
            type:          'HOSTILE_ASSET_FREEZE_FEE',
            amountUah:     fee.negated(),
            balanceBefore: balance,
            balanceAfter:  newBal,
            description:
              `Судовий арешт активів: compliance < 0.5 + прострочені кредити. ` +
              `Суд.збір ₴${fee.toFixed(0)} тік ${currentTick}`,
            referenceId:   playerId,
          },
        });
      }
    });
  }

  /**
   * Знімає судовий арешт коли умови (compliance + дефолти) більше не виконуються.
   */
  private async liftHostileAssetFreeze(playerId: string): Promise<void> {
    await this.db.enterprise.updateMany({
      where: { playerId, isLegallyFrozen: true, legalFreezeReason: LEGAL_FREEZE_REASON },
      data: {
        isLegallyFrozen:   false,
        legalFreezeReason: null,
      },
    });
  }
}
