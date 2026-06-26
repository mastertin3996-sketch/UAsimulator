// Ukrainian economic constants calibrated to 2026 market conditions.
// All monetary values in UAH unless noted.

export const TAX_RATES = {
  VAT: 0.20,             // ПДВ — Value Added Tax
  CIT: 0.18,             // Податок на прибуток — Corporate Income Tax
  ESV: 0.22,             // ЄСВ — Unified Social Contribution (paid BY employer on gross)
  PIT: 0.18,             // ПДФО — Personal Income Tax (withheld FROM employee)
  MILITARY: 0.05,        // Військовий збір — wartime rate (raised from 1.5% in 2024)
} as const;

// Total employer cost multiplier: grossSalary * (1 + ESV)
export const EMPLOYER_COST_MULTIPLIER = 1 + TAX_RATES.ESV; // 1.22

// Employee receives: grossSalary * (1 - PIT - MILITARY)
export const EMPLOYEE_NET_MULTIPLIER = 1 - TAX_RATES.PIT - TAX_RATES.MILITARY; // 0.77

// ─── Tick system ─────────────────────────────────────────────────────────────
// 1 real hour = 1 game-day tick
export const TICKS_PER_MONTH    = 30n as bigint;   // 30 game-days = 1 in-game month
export const TICKS_PER_YEAR     = 360n as bigint;
export const TICKS_PER_SNAPSHOT = 24n as bigint;   // DailySnapshot interval (≈1 in-game week)

// ─── Salaries (gross UAH/month, Kyiv baseline 2026) ────────────────────────
// Regional multiplier applied separately via city.wageCoefficient
export const BASELINE_SALARY_UAH: Record<string, number> = {
  ACCOUNTANT:          22_000,
  MANAGER:             30_000,
  OPERATOR:            18_000,
  ENGINEER:            28_000,
  AGRONOMIST:          20_000,
  LOADER:              14_000,
  DRIVER:              16_000,
  SECURITY_GUARD:      15_000,
  CLEANER:             12_000,
  SALES_REP:           20_000,
  IT_SPECIALIST:       50_000,
  LAWYER:              35_000,
  HR_SPECIALIST:       22_000,
  TECHNICIAN:          20_000,
  QUALITY_CONTROLLER:  24_000,
};

// ─── Construction (UAH/m²) — ключі відповідають EnterpriseType ──────────────
export const CONSTRUCTION_COST_PER_M2: Record<string, number> = {
  OFFICE:           20_000,
  AGRO_FARM:         8_000,
  TEXTILE_FACTORY:  12_000,
  FOOD_PROCESSING:  12_000,
  RETAIL_STORE:     15_000,
  WAREHOUSE:         9_000,
  LOGISTICS_HUB:    11_000,
};

// Кількість тиків на кожні 100 м² будівництва
export const CONSTRUCTION_TICKS_PER_100M2: Record<string, number> = {
  OFFICE:           10,
  AGRO_FARM:         5,
  TEXTILE_FACTORY:   8,
  FOOD_PROCESSING:   8,
  RETAIL_STORE:      7,
  WAREHOUSE:         6,
  LOGISTICS_HUB:     7,
};

// ─── Equipment wear thresholds (0.0–1.0 шкала, відповідає wearAndTear у схемі) ──
export const WEAR_THRESHOLDS = {
  NEW_MAX:  0.10,  // wearAndTear < 0.10  → NEW
  WORN_MIN: 0.80,  // wearAndTear ≥ 0.80  → WORN  (-50% виходу)
  // wearAndTear ≥ 1.00 → BROKEN (isBroken = true)
} as const;

// Ймовірність раптового виходу з ладу на тік, якщо статус WORN
export const WORN_FAILURE_CHANCE_PER_TICK = 0.02;

// Штраф зносу за місяць без ТО: приріст wearRatePerTick × множник
export const MAINTENANCE_PENALTY_PER_MONTH = 0.25;

// ─── Employee mood system (0.0–1.0 шкала, відповідає mood у схемі) ──────────
export const MOOD = {
  NATURAL_TARGET:         0.65,  // рівновага настрою
  DRIFT_RATE:             0.01,  // частка різниці до цілі за тік
  PAID_ON_TIME_BONUS:     0.02,  // бонус настрою у день виплати
  LATE_PAY_PENALTY:      -0.04,  // штраф за запізнілу виплату
  NO_PAY_60TICK_PENALTY: -0.08,  // штраф при відсутності виплати > 60 тиків
  OVERWORK_PENALTY:      -0.01,  // штраф за перевантаження
  STRIKE_THRESHOLD:       0.25,  // нижче → ризик страйку
  STRIKE_AUTO_RESOLVE:    0.35,  // вище → умова для автозавершення страйку
  // Штраф за зарплату нижче міського мінімуму (wageBaselineUah):
  // maxPenalty при зарплаті ₴0; лінійно масштабується до 0 на рівні базової.
  UNDERPAY_PENALTY_MAX:   0.06,  // макс. -0.06/тік при salary = 0% від baseline
  // Обладнання офісу (лише для OFFICE підприємств):
  EQUIP_BONUS:            0.015, // +0.015/тік при ratio ≥ 1.0 (≥1 unit/employee)
  EQUIP_PENALTY:         -0.020, // -0.020/тік при ratio < 0.5
} as const;

// Ефективність (0.0–1.15) залежно від настрою (0.0–1.0)
export function moodToProductivity(mood: number): number {
  if (mood >= 0.85) return 1.15;
  if (mood >= 0.60) return 1.00;
  if (mood >= 0.40) return 0.85;
  if (mood >= 0.20) return 0.65;
  return 0.40;
}

// ─── Quality derivation weights ────────────────────────────────────────
// quality = EQUIP_WEIGHT * equipFactor + MOOD_WEIGHT * moodFactor + INPUT_WEIGHT * inputFactor
// All factors are on a 0–10 scale; result is clamped to [0, 10].
export const QUALITY_WEIGHTS = {
  EQUIPMENT: 0.40,
  MOOD:      0.30,
  INPUT:     0.30,
} as const;

// ─── NPC demand curve ─────────────────────────────────────────────────
// actualDemand = baseUnitsPerDay
//   * (referencePrice / listedPrice)^|priceElasticity|
//   * (qualityWeight * quality/10 + (1 - qualityWeight))
// clamped to [0, availableInventory]
