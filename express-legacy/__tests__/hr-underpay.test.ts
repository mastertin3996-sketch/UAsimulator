/**
 * TEST SUITE 2 — HR Underpay Mood & Production Drop
 *
 * Сценарій: гравець виплачує ₴5 000/міс співробітнику у Київській фірмі,
 * де міський мінімум (wageBaselineUah) = ₴20 300.
 *
 * Механіка:
 *   underpayRatio  = 1 − (5 000 / 20 300) ≈ 0.754
 *   underpayPenalty = −0.06 × 0.754 ≈ −0.0452/тік
 *
 *   Починаючи з mood = 0.70:
 *     Після ~10 тиків: mood ≈ 0.21 < STRIKE_THRESHOLD (0.25) → ризик страйку
 *     Ефективність при mood < 0.20: 0.40 (мінімум за moodToProductivity)
 *
 * Тест 1: перевіряємо формулу underpayPenalty напряму
 * Тест 2: симулюємо 12 тиків і підтверджуємо падіння настрою нижче 0.25
 * Тест 3: ефективність падає до 0.40 при критично низькому настрої
 * Тест 4: при зарплаті ≥ baseline — штраф відсутній
 */

import { PrismaClient }                    from '@prisma/client';
import { Decimal }                          from '@prisma/client/runtime/library';
import { HRService }                        from '../services/HRService';
import { MOOD, moodToProductivity }         from '../constants/economic';
import { createMockPrisma, resetMockPrisma } from './helpers/mockPrisma';

// ── Константи сценарію ───────────────────────────────────────────────────────

const KYIV_WAGE_BASELINE_UAH = 20_300;
const UNDERPAY_SALARY_UAH    =  5_000;
const MARKET_SALARY_UAH      = 22_000;  // вище базового

const PLAYER_ID     = 'player-underpay-0000-0000-000000000001';
const ENTERPRISE_ID = 'enterprise-0000-0000-0000-000000000001';
const EMPLOYEE_ID   = 'employee-00000000-0000-0000-000000000001';

// ── Фабрика фейкового співробітника ─────────────────────────────────────────

function makeEmployee(overrides: {
  mood?:           number;
  salaryUah?:      number;
  isOnStrike?:     boolean;
  wageBaseline?:   number;
  lastPaidAt?:     Date | null;
  strikeStartedTick?: bigint | null;
}) {
  const salary       = overrides.salaryUah ?? UNDERPAY_SALARY_UAH;
  const wageBaseline = overrides.wageBaseline ?? KYIV_WAGE_BASELINE_UAH;

  return {
    id:                 EMPLOYEE_ID,
    playerId:           PLAYER_ID,
    enterpriseId:       ENTERPRISE_ID,
    firstName:          'Іван',
    lastName:           'Петренко',
    profession:         'OPERATOR' as const,
    salaryUah:          new Decimal(salary.toString()),
    mood:               overrides.mood ?? 0.70,
    baseEfficiency:     1.0,
    efficiency:         1.0,
    isOnStrike:         overrides.isOnStrike ?? false,
    strikeStartedTick:  overrides.strikeStartedTick ?? null,
    hiredAt:            new Date('2026-01-01'),
    lastPaidAt:         overrides.lastPaidAt ?? new Date(Date.now() - 5 * 3600 * 1000),
    accruedSalaryUah:   new Decimal('0'),
    // Вкладені join-дані (повертаються HRService.processTick)
    enterprise: {
      id:          ENTERPRISE_ID,
      landPlot: {
        city: { wageBaselineUah: new Decimal(wageBaseline.toString()) },
      },
    },
  };
}

// ── Допоміжна функція для розрахунку очікуваного mood ──────────────────────

function expectedMoodAfterTick(mood: number, salary: number, baseline: number): number {
  const drift         = (MOOD.NATURAL_TARGET - mood) * MOOD.DRIFT_RATE;
  const underpayRatio = salary < baseline ? 1 - salary / baseline : 0;
  const underpay      = -MOOD.UNDERPAY_PENALTY_MAX * underpayRatio;
  return Math.max(0, Math.min(1, mood + drift + underpay));
}

// ── Тести ───────────────────────────────────────────────────────────────────

describe('HRService.processTick — underpay mood penalty (Kyiv ₴5 000 vs ₴20 300 baseline)', () => {
  let mock: ReturnType<typeof createMockPrisma>;
  let svc:  HRService;

  beforeEach(() => {
    mock = createMockPrisma();
    svc  = new HRService(mock as unknown as PrismaClient);
  });

  afterEach(() => {
    resetMockPrisma(mock);
  });

  // ── Тест 1: одиночний тік — перевірка формули ────────────────────────────

  it('applies correct underpay penalty formula for ₴5 000 salary in Kyiv', async () => {
    const emp = makeEmployee({ mood: 0.70 });
    mock.employee.findMany.mockResolvedValueOnce([emp]);
    mock.employee.update.mockResolvedValue({});

    const results = await svc.processTick(PLAYER_ID, 1n, new Set());

    expect(results).toHaveLength(1);

    const result     = results[0]!;
    const expected   = expectedMoodAfterTick(0.70, UNDERPAY_SALARY_UAH, KYIV_WAGE_BASELINE_UAH);

    // underpayRatio ≈ 0.754, penalty ≈ −0.0452
    // drift ≈ (0.65 − 0.70) × 0.01 = −0.0005
    // Δmood ≈ −0.0457 → newMood ≈ 0.654
    expect(result.moodAfter).toBeCloseTo(expected, 4);
    expect(result.moodAfter).toBeLessThan(result.moodBefore);
    expect(result.moodBefore - result.moodAfter).toBeGreaterThan(0.04);  // помітне падіння

    // Перевіряємо, що employee.update викликаний із правильним mood
    const updateCall = mock.employee.update.mock.calls[0]![0] as {
      data: { mood: number };
    };
    expect(updateCall.data.mood).toBeCloseTo(expected, 4);
  });

  // ── Тест 2: 12 тиків — mood падає нижче порогу страйку ──────────────────

  it('drops mood below strike threshold (0.25) within ~10–12 ticks at ₴5 000 salary', async () => {
    let currentMood = 0.70;

    for (let tick = 1; tick <= 12; tick++) {
      const emp = makeEmployee({ mood: currentMood });
      mock.employee.findMany.mockResolvedValueOnce([emp]);
      mock.employee.update.mockResolvedValue({});

      const results = await svc.processTick(PLAYER_ID, BigInt(tick), new Set());
      currentMood   = results[0]!.moodAfter;
    }

    expect(currentMood).toBeLessThan(MOOD.STRIKE_THRESHOLD);  // 0.25
  });

  // ── Тест 3: при критичному настрої ефективність = 0.40 (мінімум) ────────

  it('drops production efficiency to minimum (0.40) when mood falls critically low', async () => {
    // Симулюємо 15 тиків для гарантованого падіння нижче 0.20
    let currentMood = 0.70;

    for (let tick = 1; tick <= 15; tick++) {
      const emp = makeEmployee({ mood: currentMood });
      mock.employee.findMany.mockResolvedValueOnce([emp]);
      mock.employee.update.mockResolvedValue({});

      const results = await svc.processTick(PLAYER_ID, BigInt(tick), new Set());
      currentMood   = results[0]!.moodAfter;
    }

    // При mood < 0.20 → moodToProductivity повертає 0.40
    expect(currentMood).toBeLessThan(0.20);
    expect(moodToProductivity(currentMood)).toBe(0.40);

    // Ще один тік: efficiency у результаті теж 0.40
    const emp = makeEmployee({ mood: currentMood });
    mock.employee.findMany.mockResolvedValueOnce([emp]);
    mock.employee.update.mockResolvedValue({});

    const finalTick = await svc.processTick(PLAYER_ID, 16n, new Set());
    expect(finalTick[0]!.efficiency).toBe(0.40);
  });

  // ── Тест 4: зарплата ≥ baseline — штраф не застосовується ───────────────

  it('applies no underpay penalty when salary is at or above city baseline', async () => {
    const emp = makeEmployee({
      mood:      0.70,
      salaryUah: MARKET_SALARY_UAH,   // ₴22 000 > ₴20 300 baseline
    });
    mock.employee.findMany.mockResolvedValueOnce([emp]);
    mock.employee.update.mockResolvedValue({});

    const results = await svc.processTick(PLAYER_ID, 1n, new Set());

    // Без штрафу: Δmood = тільки drift = (0.65 − 0.70) × 0.01 = −0.0005
    const result   = results[0]!;
    const expected = expectedMoodAfterTick(0.70, MARKET_SALARY_UAH, KYIV_WAGE_BASELINE_UAH);

    expect(result.moodAfter).toBeCloseTo(expected, 4);

    // Настрій практично не змінився (лише drift)
    const delta = Math.abs(result.moodBefore - result.moodAfter);
    expect(delta).toBeLessThan(0.01);  // drift < 0.01, без штрафу
  });

  // ── Тест 5: у місті з нижчим baseline — менший штраф ────────────────────

  it('applies smaller penalty in cities with lower wage baseline', async () => {
    const RURAL_BASELINE  = 12_000;  // наприклад, Херсон — менший мінімум

    const empKyiv  = makeEmployee({ mood: 0.70, wageBaseline: KYIV_WAGE_BASELINE_UAH });
    const empRural = makeEmployee({ mood: 0.70, wageBaseline: RURAL_BASELINE });

    // Тік для Київського співробітника
    mock.employee.findMany.mockResolvedValueOnce([empKyiv]);
    mock.employee.update.mockResolvedValue({});
    const [kyivResult] = await svc.processTick(PLAYER_ID, 1n, new Set());

    // Тік для сільського співробітника
    mock.employee.findMany.mockResolvedValueOnce([empRural]);
    mock.employee.update.mockResolvedValue({});
    const [ruralResult] = await svc.processTick(PLAYER_ID, 2n, new Set());

    // Обидва падають, але київський — різкіше (більший underpayRatio)
    const kyivDrop  = kyivResult!.moodBefore - kyivResult!.moodAfter;
    const ruralDrop = ruralResult!.moodBefore - ruralResult!.moodAfter;

    expect(kyivDrop).toBeGreaterThan(ruralDrop);
    // При Kyiv baseline 20 300: ratio ≈ 0.754, penalty ≈ −0.0452
    // При Rural baseline 12 000: ratio ≈ 0.583, penalty ≈ −0.0350
    expect(kyivDrop).toBeCloseTo(0.0457, 2);
    expect(ruralDrop).toBeCloseTo(0.0355, 2);
  });

  // ── Тест 6: страйк починається при критичному настрої ───────────────────

  it('triggers strike when mood drops below STRIKE_THRESHOLD', async () => {
    // Починаємо вже близько до порогу
    const emp = makeEmployee({ mood: 0.24 });  // нижче STRIKE_THRESHOLD = 0.25
    mock.employee.findMany.mockResolvedValueOnce([emp]);
    mock.employee.update.mockResolvedValue({});

    // Підмінюємо Math.random для детермінованого результату
    const originalRandom = Math.random;
    Math.random = () => 0.001;  // завжди → страйк при mood < 0.25

    try {
      const results = await svc.processTick(PLAYER_ID, 1n, new Set());
      expect(results[0]!.wentOnStrike).toBe(true);
    } finally {
      Math.random = originalRandom;
    }
  });
});
