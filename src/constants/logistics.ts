// ═══════════════════════════════════════════════════════════════════════════════
// LOGISTICS CONSTANTS — Ukrainian freight network, 2026
// ═══════════════════════════════════════════════════════════════════════════════

// ── Freight cost formula constants ────────────────────────────────────────────
// Based on 2026 Ukrainian commercial freight benchmarks.
//
// Full cost per km breakdown:
//   Fuel:    30 L/100km × 53 UAH/L ÷ 100 = 15.90 UAH/km
//   Driver:  25 000 UAH/mo ÷ 9 600 km/mo  =  2.60 UAH/km
//   Overheads (insurance, tolls, tyre wear):  5.00 UAH/km
//   ──────────────────────────────────────── ─────────────
//   Total:                                   23.50 UAH/km

export const FREIGHT = {
  /** Diesel price, UAH/L (commercial pump price Q1 2026) */
  FUEL_PRICE_UAH_PER_L:        53.0,
  /** Standard semi-truck fuel burn, L/100 km */
  FUEL_BURN_L_PER_100KM:       30,
  /** Driver wage component per km (monthly ₴25 000 ÷ 9 600 km) */
  DRIVER_WAGE_UAH_PER_KM:       2.6,
  /** Insurance, tolls, tyre, depreciation per km */
  OVERHEAD_UAH_PER_KM:          5.0,
  /** Minimum per-shipment charge — covers loading/unloading time */
  MINIMUM_FREIGHT_UAH:       2_000,
  /** Standard 13.6 m trailer capacity (m³) */
  TRUCK_CAPACITY_M3:            82,
  /** Standard truck payload (kg) */
  TRUCK_CAPACITY_KG:        20_000,
  /**
   * Effective road speed for delivery-tick calculation (km per game day).
   * Lower than raw km/h × 24 to account for loading, unloading, rest stops,
   * checkpoints and typical Ukrainian road conditions.
   *
   * Results:
   *  <250 km  → 1 tick  (Kyiv↔Zhytomyr, Kyiv↔Cherkasy)
   *   250–500 → 2 ticks (Kyiv↔Dnipro, Kyiv↔Lviv, Kyiv↔Odesa)
   *   500–750 → 3 ticks
   *  1000+    → 4-5 ticks (cross-country hauls)
   */
  EFFECTIVE_SPEED_KM_PER_TICK: 250,
  /** Spoilage fraction applied per tick when warehouse is over capacity */
  SPOILAGE_RATE_PER_TICK:       0.10,
} as const;

/** Pre-computed total per-km cost (UAH) */
export const FREIGHT_COST_PER_KM_UAH =
  (FREIGHT.FUEL_PRICE_UAH_PER_L * FREIGHT.FUEL_BURN_L_PER_100KM) / 100
  + FREIGHT.DRIVER_WAGE_UAH_PER_KM
  + FREIGHT.OVERHEAD_UAH_PER_KM;
// 15.90 + 2.60 + 5.00 = 23.50 UAH/km

// ── Cargo volume reference — m³ per tonne ────────────────────────────────────
// For lookup when Product.baseVolumeLitre is 0 or as a game-design reference.
// Formula: m³/tonne = 1 000 / density_kg_per_m3
export const CARGO_M3_PER_TONNE: Record<string, number> = {
  GRAIN:              1.30,  // wheat/corn   ~770 kg/m³
  SUNFLOWER_OIL:      1.10,  // bulk liquid  ~910 kg/m³
  FLOUR:              1.60,  // sifted flour ~625 kg/m³
  SUGAR:              1.05,  // refined      ~950 kg/m³
  IRON_ORE:           0.50,  // hematite    ~2 000 kg/m³
  COAL:               0.67,  // bituminous  ~1 500 kg/m³
  STEEL:              0.13,  // billet/slab ~8 000 kg/m³
  TIMBER:             1.50,  // pine logs   ~670 kg/m³
  MANUFACTURED_GOODS: 3.00,  // boxed retail, bulky & light
  ELECTRONICS:        5.00,  // high cube, very light
  TEXTILES:           4.00,  // fabric rolls
  CHEMICALS:          1.00,  // varies; average
  FERTILIZER:         0.75,  // granular    ~1 330 kg/m³
  DEFAULT:            2.00,  // unknown product fallback
};

// ── Ukrainian road distance matrix (km) ──────────────────────────────────────
// Source: road routing estimates for commercial vehicles, 2024.
// Upper-triangular only (A→B same as B→A). LogisticsService handles both orders.
// Keys = City.name (English) from the DB.
//
// Coverage: 18 major logistics hubs:
//   Kyiv, Kharkiv, Dnipro, Odesa, Lviv, Zaporizhzhia, Poltava, Vinnytsia,
//   Zhytomyr, Rivne, Chernivtsi, Ternopil, Khmelnytskyi, Cherkasy,
//   Mykolaiv, Sumy, Chernihiv, Kremenchuk, Ivano-Frankivsk

export const UKRAINE_DISTANCES_KM: Record<string, Record<string, number>> = {
  Kyiv: {
    Kharkiv:           480,
    Dnipro:            480,
    Odesa:             480,
    Lviv:              540,
    Zaporizhzhia:      560,
    Poltava:           340,
    Vinnytsia:         260,
    Zhytomyr:          140,
    Rivne:             305,
    Chernivtsi:        530,
    Ternopil:          460,
    Khmelnytskyi:      360,
    Cherkasy:          200,
    Mykolaiv:          460,
    Sumy:              360,
    Chernihiv:         140,
    Kremenchuk:        330,
    'Ivano-Frankivsk': 660,
  },
  Kharkiv: {
    Dnipro:            220,
    Odesa:             740,
    Lviv:            1_080,
    Zaporizhzhia:      270,
    Poltava:           140,
    Vinnytsia:         740,
    Zhytomyr:          590,
    Rivne:             760,
    Chernivtsi:        960,
    Ternopil:          870,
    Khmelnytskyi:      810,
    Cherkasy:          490,
    Mykolaiv:          760,
    Sumy:              200,
    Chernihiv:         520,
    Kremenchuk:        360,
    'Ivano-Frankivsk': 1_100,
  },
  Dnipro: {
    Odesa:             470,
    Lviv:            1_020,
    Zaporizhzhia:       85,
    Poltava:           260,
    Vinnytsia:         740,
    Zhytomyr:          600,
    Rivne:             780,
    Chernivtsi:        940,
    Ternopil:          890,
    Khmelnytskyi:      830,
    Cherkasy:          290,
    Mykolaiv:          470,
    Sumy:              430,
    Chernihiv:         600,
    Kremenchuk:        230,
    'Ivano-Frankivsk': 1_060,
  },
  Odesa: {
    Lviv:              900,
    Zaporizhzhia:      350,
    Poltava:           490,
    Vinnytsia:         260,
    Zhytomyr:          420,
    Rivne:             640,
    Chernivtsi:        430,
    Ternopil:          560,
    Khmelnytskyi:      470,
    Cherkasy:          290,
    Mykolaiv:           65,
    Sumy:              820,
    Chernihiv:         620,
    Kremenchuk:        400,
    'Ivano-Frankivsk': 640,
  },
  Lviv: {
    Zaporizhzhia:    1_050,
    Poltava:           820,
    Vinnytsia:         360,
    Zhytomyr:          400,
    Rivne:             210,
    Chernivtsi:        340,
    Ternopil:           80,
    Khmelnytskyi:      180,
    Cherkasy:          730,
    Mykolaiv:          890,
    Sumy:            1_080,
    Chernihiv:         680,
    Kremenchuk:        790,
    'Ivano-Frankivsk': 130,
  },
  Zaporizhzhia: {
    Poltava:           330,
    Vinnytsia:         700,
    Zhytomyr:          590,
    Rivne:             790,
    Chernivtsi:        920,
    Ternopil:          900,
    Khmelnytskyi:      850,
    Cherkasy:          350,
    Mykolaiv:          380,
    Sumy:              490,
    Chernihiv:         680,
    Kremenchuk:        280,
    'Ivano-Frankivsk': 1_070,
  },
  Poltava: {
    Vinnytsia:         560,
    Zhytomyr:          440,
    Rivne:             610,
    Chernivtsi:        730,
    Ternopil:          680,
    Khmelnytskyi:      640,
    Cherkasy:          200,
    Mykolaiv:          530,
    Sumy:              290,
    Chernihiv:         380,
    Kremenchuk:        130,
    'Ivano-Frankivsk': 850,
  },
  Vinnytsia: {
    Zhytomyr:          140,
    Rivne:             340,
    Chernivtsi:        390,
    Ternopil:          280,
    Khmelnytskyi:      130,
    Cherkasy:          420,
    Mykolaiv:          340,
    Sumy:              770,
    Chernihiv:         410,
    Kremenchuk:        460,
    'Ivano-Frankivsk': 390,
  },
  Zhytomyr: {
    Rivne:             190,
    Chernivtsi:        430,
    Ternopil:          340,
    Khmelnytskyi:      240,
    Cherkasy:          300,
    Mykolaiv:          480,
    Sumy:              570,
    Chernihiv:         280,
    Kremenchuk:        380,
    'Ivano-Frankivsk': 520,
  },
  Rivne: {
    Chernivtsi:        340,
    Ternopil:          220,
    Khmelnytskyi:      210,
    Cherkasy:          510,
    Mykolaiv:          670,
    Sumy:              740,
    Chernihiv:         450,
    Kremenchuk:        590,
    'Ivano-Frankivsk': 270,
  },
  Chernivtsi: {
    Ternopil:          180,
    Khmelnytskyi:      260,
    Cherkasy:          650,
    Mykolaiv:          600,
    Sumy:              960,
    Chernihiv:         680,
    Kremenchuk:        770,
    'Ivano-Frankivsk': 150,
  },
  Ternopil: {
    Khmelnytskyi:      110,
    Cherkasy:          640,
    Mykolaiv:          740,
    Sumy:              900,
    Chernihiv:         620,
    Kremenchuk:        760,
    'Ivano-Frankivsk':  80,
  },
  Khmelnytskyi: {
    Cherkasy:          570,
    Mykolaiv:          580,
    Sumy:              870,
    Chernihiv:         520,
    Kremenchuk:        650,
    'Ivano-Frankivsk': 200,
  },
  Cherkasy: {
    Mykolaiv:          370,
    Sumy:              450,
    Chernihiv:         360,
    Kremenchuk:        130,
    'Ivano-Frankivsk': 830,
  },
  Mykolaiv: {
    Sumy:              840,
    Chernihiv:         630,
    Kremenchuk:        410,
    'Ivano-Frankivsk': 890,
  },
  Sumy: {
    Chernihiv:         260,
    Kremenchuk:        350,
    'Ivano-Frankivsk': 1_120,
  },
  Chernihiv: {
    Kremenchuk:        470,
    'Ivano-Frankivsk': 800,
  },
  Kremenchuk: {
    'Ivano-Frankivsk': 900,
  },
  'Ivano-Frankivsk': {},
};

/**
 * Look up road distance (km) between two Ukrainian cities.
 * Returns undefined if neither direction is found in the matrix.
 */
export function getDistance(cityA: string, cityB: string): number | undefined {
  return UKRAINE_DISTANCES_KM[cityA]?.[cityB]
      ?? UKRAINE_DISTANCES_KM[cityB]?.[cityA];
}

/**
 * Default risk factors per route.
 * Higher values → longer effective delivery time and potential cargo loss.
 * Ranges: 0.02 (safe) → 0.20 (conflict-adjacent / poor roads)
 */
export const DEFAULT_ROUTE_RISK: Record<string, Record<string, number>> = {
  // Routes near conflict zones or with poor infrastructure have elevated risk
  Kharkiv:      { Sumy: 0.15, Dnipro: 0.10, Zaporizhzhia: 0.18 },
  Zaporizhzhia: { Dnipro: 0.12, Mykolaiv: 0.15, Kharkiv: 0.18 },
  Mykolaiv:     { Zaporizhzhia: 0.15, Odesa: 0.05 },
  Sumy:         { Kharkiv: 0.15, Chernihiv: 0.10 },
  Chernihiv:    { Sumy: 0.10, Kyiv: 0.05 },
};

export function getDefaultRiskFactor(cityA: string, cityB: string): number {
  return DEFAULT_ROUTE_RISK[cityA]?.[cityB]
      ?? DEFAULT_ROUTE_RISK[cityB]?.[cityA]
      ?? 0.05;
}
