/**
 * Equipment catalog — single source of truth for all installable equipment SKUs.
 *
 * Values are based on real-world electrical ratings and maintenance schedules,
 * scaled to make the game economically meaningful (see comments per entry).
 *
 * To add a new equipment type: add one entry here.
 * CompanyService and workshop route read from this map automatically.
 */

export interface EquipmentSpec {
  /** Ukrainian display name */
  nameUa: string;
  /**
   * Nominal electrical power draw in kilowatts (kW).
   * Energy billing: kWhPerTick = energyConsumptionKw × 24 h × utilisationRate
   */
  energyConsumptionKw: number;
  /**
   * Wear increment per game-day at 100 % utilisation (0.005 = 0.5 %/day).
   * Heavier / harsher machinery accumulates wear faster.
   */
  wearRatePerTick: number;
  /**
   * Quality output modifier when equipment is brand new (0.0–1.0).
   * Premium or specialised machines produce higher-quality output.
   */
  baseQualityModifier: number;
  /** Workshop floor space consumed (m²). */
  footprintM2: number;
  /**
   * Catalogue base price (UAH). Used as default when NPC reference price is absent.
   * Maintenance cost = 3 % of this per planned service.
   */
  basePriceUah: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// FACTORY / AGRO EQUIPMENT
// ─────────────────────────────────────────────────────────────────────────────
//
// Energy sources for kW values:
//   EQ-MILLGRIND  22 kW  — industrial stone/roller mill 15–30 kW (e.g. Bühler MDDP)
//   EQ-OILPRESS   15 kW  — screw oil press 7.5–22 kW (cold-press models)
//   EQ-FURNACE    45 kW  — electric food-grade furnace/oven 30–75 kW
//   EQ-TRACTOR    60 kW  — 80 HP tractor ≈ 60 kW shaft power (diesel, modeled as kW equivalent)
//   EQ-SAWMILL    30 kW  — band sawmill 18.5–37 kW (e.g. Wood-Mizer LT70)
//   EQ-DAIRYLINE  25 kW  — pasteurizer + separator + plate cooler combined ~20–30 kW
// ─────────────────────────────────────────────────────────────────────────────

const FACTORY_SPECS: Record<string, EquipmentSpec> = {
  'EQ-MILLGRIND': {
    nameUa:              'Млинарська машина',
    energyConsumptionKw: 22,
    wearRatePerTick:     0.008, // grinding stones & bearings, moderate wear
    baseQualityModifier: 0.90,
    footprintM2:         25,
    basePriceUah:        180_000,
  },
  'EQ-OILPRESS': {
    nameUa:              'Прес для олії',
    energyConsumptionKw: 15,
    wearRatePerTick:     0.007, // continuous press under load
    baseQualityModifier: 0.92,
    footprintM2:         20,
    basePriceUah:        120_000,
  },
  'EQ-FURNACE': {
    nameUa:              'Промислова піч',
    energyConsumptionKw: 45,
    wearRatePerTick:     0.008, // thermal cycling degrades refractory lining
    baseQualityModifier: 0.95,
    footprintM2:         35,
    basePriceUah:        250_000,
  },
  'EQ-TRACTOR': {
    nameUa:              'Сільгосптрактор',
    energyConsumptionKw: 60, // 80 HP ≈ 60 kW; modeled as diesel-equivalent electrical load
    wearRatePerTick:     0.012, // outdoor heavy use, fastest wear
    baseQualityModifier: 0.88,
    footprintM2:         40,
    basePriceUah:        380_000,
  },
  'EQ-SAWMILL': {
    nameUa:              'Лісопильний верстат',
    energyConsumptionKw: 30,
    wearRatePerTick:     0.010, // blade + feed mechanism under heavy load
    baseQualityModifier: 0.90,
    footprintM2:         60,
    basePriceUah:        320_000,
  },
  'EQ-DAIRYLINE': {
    nameUa:              'Молочна лінія',
    energyConsumptionKw: 25,
    wearRatePerTick:     0.006, // food-grade conditions → slower wear
    baseQualityModifier: 0.95,
    footprintM2:         50,
    basePriceUah:        290_000,
  },
  'EQ-SILO': {
    nameUa:              'Силос (зерносховище)',
    energyConsumptionKw: 2.5,  // ventilation fan + auger motor
    wearRatePerTick:     0.003, // metal structure, very low wear
    baseQualityModifier: 1.00,  // no direct quality effect on production
    footprintM2:         30,
    basePriceUah:        120_000,
  },
  'EQ-IRRIGATION': {
    nameUa:              'Система зрошення',
    energyConsumptionKw: 15,   // pump motor for field irrigation
    wearRatePerTick:     0.005, // outdoor pipes and pump, moderate wear
    baseQualityModifier: 1.00,
    footprintM2:         20,
    basePriceUah:        180_000,
  },
  'EQ-BEEHIVE': {
    nameUa:              'Вулик (пасіка)',
    energyConsumptionKw: 0.1,  // minimal (warming lamp in winter)
    wearRatePerTick:     0.002, // wooden hive, minimal mechanical wear
    baseQualityModifier: 0.92,
    footprintM2:         4,
    basePriceUah:        8_000,
  },
  'EQ-MILKING_STATION': {
    nameUa:              'Доїльний апарат',
    energyConsumptionKw: 4.0,  // vacuum pump + pulsators ~3–5 kW
    wearRatePerTick:     0.006, // rubber liners, hoses, pump — moderate wear
    baseQualityModifier: 1.00,
    footprintM2:         15,
    basePriceUah:        320_000,
  },
  'EQ-SLAUGHTER_POULTRY': {
    nameUa:              'Міні-цех забою птиці',
    energyConsumptionKw: 8.0,  // scalder + plucker + evisceration line ~6–10 kW
    wearRatePerTick:     0.007, // blades and conveyor belts — regular wear
    baseQualityModifier: 0.95,
    footprintM2:         50,
    basePriceUah:        500_000,
  },
  'EQ-SLAUGHTER_PIGS': {
    nameUa:              'Модуль забою свиней',
    energyConsumptionKw: 15.0, // stunning device + dehairing + overhead rail ~12–18 kW
    wearRatePerTick:     0.006,
    baseQualityModifier: 0.95,
    footprintM2:         80,
    basePriceUah:        750_000,
  },
  'EQ-SLAUGHTER_CATTLE': {
    nameUa:              'Проф. модуль забою ВРХ з холодильником',
    energyConsumptionKw: 35.0, // stunning + overhead rail + refrigeration compressor ~30–40 kW
    wearRatePerTick:     0.005, // heavy-duty construction, slower wear
    baseQualityModifier: 0.98,
    footprintM2:         150,
    basePriceUah:        3_000_000,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// FOOD_PROCESSING EQUIPMENT (Wave 1 — профільні лінії, +yield/quality у FOOD-гілці ProductionService)
// ─────────────────────────────────────────────────────────────────────────────
//   EQ-BAKELINE          28 kW — тунельна хлібопекарська піч + тістоміс ~25–35 кВт
//   EQ-MEATLINE          32 kW — м'ясопереробна лінія (кутер + шприц + термокамера) ~30 кВт
//   EQ-CHEESEVAT         20 kW — сироварний чан з мішалкою + водяна сорочка ~18–25 кВт
//   EQ-BOTTLING          18 kW — лінія розливу/фасування рідин ~15–22 кВт
//   EQ-REFRIGERATOR-IND  24 kW — промислова холодильна камера (компресор) ~20–30 кВт (cold-chain)
// ─────────────────────────────────────────────────────────────────────────────

const FOOD_SPECS: Record<string, EquipmentSpec> = {
  'EQ-BAKELINE': {
    nameUa:              'Хлібопекарська лінія',
    energyConsumptionKw: 28,
    wearRatePerTick:     0.007,
    baseQualityModifier: 0.95,
    footprintM2:         40,
    basePriceUah:        320_000,
  },
  'EQ-MEATLINE': {
    nameUa:              'М’ясопереробна лінія',
    energyConsumptionKw: 32,
    wearRatePerTick:     0.009, // ножі, шнеки, термокамери — вища зношуваність
    baseQualityModifier: 0.94,
    footprintM2:         50,
    basePriceUah:        420_000,
  },
  'EQ-CHEESEVAT': {
    nameUa:              'Сироварний чан',
    energyConsumptionKw: 20,
    wearRatePerTick:     0.006,
    baseQualityModifier: 0.96,
    footprintM2:         30,
    basePriceUah:        280_000,
  },
  'EQ-BOTTLING': {
    nameUa:              'Лінія розливу',
    energyConsumptionKw: 18,
    wearRatePerTick:     0.006,
    baseQualityModifier: 0.95,
    footprintM2:         35,
    basePriceUah:        260_000,
  },
  'EQ-REFRIGERATOR-IND': {
    nameUa:              'Промислова холодильна камера',
    energyConsumptionKw: 24,
    wearRatePerTick:     0.005,
    baseQualityModifier: 1.0, // не впливає на якість виробництва; тримає холодовий ланцюг (антипсування)
    footprintM2:         45,
    basePriceUah:        350_000,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// TEXTILE_FACTORY EQUIPMENT (Wave 2 — верстати/машини, +yield/quality у TEXTILE-гілці)
// ─────────────────────────────────────────────────────────────────────────────
//   EQ-SPINNINGMILL  30 kW — прядильна машина (ватер/пневмопрядіння) ~25–35 кВт
//   EQ-LOOM          22 kW — ткацький верстат (рапірний/пневморапірний) ~18–26 кВт
//   EQ-KNITMACHINE   18 kW — в'язальна машина (кругла/плоска) ~15–22 кВт
//   EQ-SEWINGLINE    12 kW — швейна лінія (промислові машини + розкрій) ~10–15 кВт
//   EQ-DYEINGVAT     26 kW — фарбувально-оздоблювальний чан (нагрів + мішалка) ~22–30 кВт
// ─────────────────────────────────────────────────────────────────────────────

const TEXTILE_SPECS: Record<string, EquipmentSpec> = {
  'EQ-SPINNINGMILL': {
    nameUa:              'Прядильна машина',
    energyConsumptionKw: 30,
    wearRatePerTick:     0.008,
    baseQualityModifier: 0.94,
    footprintM2:         45,
    basePriceUah:        380_000,
  },
  'EQ-LOOM': {
    nameUa:              'Ткацький верстат',
    energyConsumptionKw: 22,
    wearRatePerTick:     0.008,
    baseQualityModifier: 0.95,
    footprintM2:         40,
    basePriceUah:        300_000,
  },
  'EQ-KNITMACHINE': {
    nameUa:              'В’язальна машина',
    energyConsumptionKw: 18,
    wearRatePerTick:     0.007,
    baseQualityModifier: 0.95,
    footprintM2:         35,
    basePriceUah:        260_000,
  },
  'EQ-SEWINGLINE': {
    nameUa:              'Швейна лінія',
    energyConsumptionKw: 12,
    wearRatePerTick:     0.006,
    baseQualityModifier: 0.96,
    footprintM2:         50,
    basePriceUah:        220_000,
  },
  'EQ-DYEINGVAT': {
    nameUa:              'Фарбувальний чан',
    energyConsumptionKw: 26,
    wearRatePerTick:     0.007,
    baseQualityModifier: 1.0, // ефект — через якісний бонус DYER, не через baseQualityModifier
    footprintM2:         30,
    basePriceUah:        240_000,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// WAREHOUSE EQUIPMENT (Wave 3 — ємність, обробка, холодовий ланцюг, WMS)
// ─────────────────────────────────────────────────────────────────────────────
//   EQ-RACKING    0.05 kW — стелажні системи (пасивні, LED-підсвітка)
//   EQ-FORKLIFT   3.0 kW  — електронавантажувач (зарядка АКБ, усереднено)
//   EQ-CLIMATE    8.0 kW  — система клімат-контролю (HVAC) ~6–10 кВт
//   EQ-COLDROOM   18 kW   — холодильна камера (компресор) ~15–22 кВт (cold-chain)
//   EQ-WMS        1.5 kW  — сервер+термінали системи керування складом
// ─────────────────────────────────────────────────────────────────────────────

const WAREHOUSE_SPECS: Record<string, EquipmentSpec> = {
  'EQ-RACKING': {
    nameUa:              'Стелажні системи',
    energyConsumptionKw: 0.05,
    wearRatePerTick:     0.002,
    baseQualityModifier: 1.0,
    footprintM2:         60,
    basePriceUah:        120_000,
  },
  'EQ-FORKLIFT': {
    nameUa:              'Навантажувач',
    energyConsumptionKw: 3.0,
    wearRatePerTick:     0.008,
    baseQualityModifier: 1.0,
    footprintM2:         12,
    basePriceUah:        180_000,
  },
  'EQ-CLIMATE': {
    nameUa:              'Клімат-контроль',
    energyConsumptionKw: 8.0,
    wearRatePerTick:     0.005,
    baseQualityModifier: 1.0,
    footprintM2:         20,
    basePriceUah:        220_000,
  },
  'EQ-COLDROOM': {
    nameUa:              'Холодильна камера',
    energyConsumptionKw: 18,
    wearRatePerTick:     0.005,
    baseQualityModifier: 1.0,
    footprintM2:         50,
    basePriceUah:        340_000,
  },
  'EQ-WMS': {
    nameUa:              'Система WMS',
    energyConsumptionKw: 1.5,
    wearRatePerTick:     0.004,
    baseQualityModifier: 1.0,
    footprintM2:         8,
    basePriceUah:        160_000,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// RETAIL EQUIPMENT
// ─────────────────────────────────────────────────────────────────────────────
//
//   EQ-CASHREGISTER   0.20 kW — fiscal printer + display + keyboard ~100–200 W
//   EQ-POSTERMINAL    0.08 kW — card terminal 30–100 W standby+active avg
//   EQ-SHELVING       0.05 kW — passive; LED shelf-lighting overhead ~50 W
//   EQ-DISPLAYFRIDGE  0.45 kW — commercial display cooler 350–550 W
//   EQ-FREEZER        0.80 kW — chest/upright commercial freezer 500–1200 W
//   EQ-CCTV           0.15 kW — 8-ch NVR + cameras 100–200 W
//   EQ-SCALE          0.05 kW — retail scale with label printer 20–100 W
//   EQ-PRICETAG       0.05 kW — e-ink hub + radio transmitters ~50 W
//   EQ-SELFCHECKOUT   0.55 kW — kiosk + printer + scanner 400–700 W
//   EQ-CONVEYOR       1.50 kW — light-duty checkout conveyor 750 W–2.2 kW
// ─────────────────────────────────────────────────────────────────────────────

const RETAIL_SPECS: Record<string, EquipmentSpec> = {
  'EQ-CASHREGISTER': {
    nameUa:              'Касовий апарат',
    energyConsumptionKw: 0.20,
    wearRatePerTick:     0.003,
    baseQualityModifier: 1.0,
    footprintM2:         5,
    basePriceUah:        25_000,
  },
  'EQ-POSTERMINAL': {
    nameUa:              'POS-термінал',
    energyConsumptionKw: 0.08,
    wearRatePerTick:     0.003,
    baseQualityModifier: 1.0,
    footprintM2:         2,
    basePriceUah:        12_000,
  },
  'EQ-SHELVING': {
    nameUa:              'Торгові стелажі',
    energyConsumptionKw: 0.05,
    wearRatePerTick:     0.001, // passive steel shelving, minimal wear
    baseQualityModifier: 0.85,
    footprintM2:         8,
    basePriceUah:        18_000,
  },
  'EQ-DISPLAYFRIDGE': {
    nameUa:              'Вітринний холодильник',
    energyConsumptionKw: 0.45,
    wearRatePerTick:     0.004, // compressor and door seals wear
    baseQualityModifier: 0.95,
    footprintM2:         6,
    basePriceUah:        45_000,
  },
  'EQ-FREEZER': {
    nameUa:              'Торговий морозильник',
    energyConsumptionKw: 0.80,
    wearRatePerTick:     0.004,
    baseQualityModifier: 0.95,
    footprintM2:         8,
    basePriceUah:        55_000,
  },
  'EQ-CCTV': {
    nameUa:              'Система відеонагляду',
    energyConsumptionKw: 0.15,
    wearRatePerTick:     0.002,
    baseQualityModifier: 1.0,
    footprintM2:         1,
    basePriceUah:        20_000,
  },
  'EQ-SCALE': {
    nameUa:              'Торгові ваги',
    energyConsumptionKw: 0.05,
    wearRatePerTick:     0.002,
    baseQualityModifier: 1.0,
    footprintM2:         2,
    basePriceUah:        8_000,
  },
  'EQ-PRICETAG': {
    nameUa:              'Система електронних цінників',
    energyConsumptionKw: 0.05,
    wearRatePerTick:     0.002,
    baseQualityModifier: 1.0,
    footprintM2:         1,
    basePriceUah:        30_000,
  },
  'EQ-SELFCHECKOUT': {
    nameUa:              'Каса самообслуговування',
    energyConsumptionKw: 0.55,
    wearRatePerTick:     0.004, // touch screen + scanner + printer → moderate wear
    baseQualityModifier: 1.0,
    footprintM2:         6,
    basePriceUah:        120_000,
  },
  'EQ-CONVEYOR': {
    nameUa:              'Конвеєрна стрічка',
    energyConsumptionKw: 1.50,
    wearRatePerTick:     0.005, // belt + motor under continuous use
    baseQualityModifier: 0.90,
    footprintM2:         10,
    basePriceUah:        40_000,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// OFFICE EQUIPMENT
// ─────────────────────────────────────────────────────────────────────────────
//
//   EQ-DESK         0.02 kW — passive; desk lamp 20 W
//   EQ-OFFCHAIR     0.01 kW — ergonomic powered adjustable desk variant ~10 W
//   EQ-COMPUTER     0.25 kW — desktop + monitor 200–350 W
//   EQ-PRINTER      0.30 kW — laser printer standby+print cycle avg 200–400 W
//   EQ-PROJECTOR    0.35 kW — business projector 250–450 W
//   EQ-SERVER       0.40 kW — 1U rack server 200–600 W (midrange)
//   EQ-PBXPHONE     0.10 kW — PBX unit + 8 phones 50–150 W
//   EQ-AIRCON       2.00 kW — 18 000 BTU split AC unit ≈ 1800 W input power
//   EQ-COFFEEMACH   1.20 kW — professional espresso machine 800–1500 W
//   EQ-OFFICESAFE   0.02 kW — electronic lock + small motor 5–30 W
// ─────────────────────────────────────────────────────────────────────────────

const OFFICE_SPECS: Record<string, EquipmentSpec> = {
  'EQ-DESK': {
    nameUa:              'Офісний стіл',
    energyConsumptionKw: 0.02,
    wearRatePerTick:     0.001, // sturdy furniture, very slow wear
    baseQualityModifier: 0.85,
    footprintM2:         6,
    basePriceUah:        6_000,
  },
  'EQ-OFFCHAIR': {
    nameUa:              'Офісне крісло',
    energyConsumptionKw: 0.01,
    wearRatePerTick:     0.002, // castors + foam degrade with daily use
    baseQualityModifier: 0.85,
    footprintM2:         1,
    basePriceUah:        4_500,
  },
  'EQ-COMPUTER': {
    nameUa:              'Комп\'ютерне робоче місце',
    energyConsumptionKw: 0.25,
    wearRatePerTick:     0.004,
    baseQualityModifier: 0.95,
    footprintM2:         2,
    basePriceUah:        35_000,
  },
  'EQ-PRINTER': {
    nameUa:              'Офісний принтер',
    energyConsumptionKw: 0.30,
    wearRatePerTick:     0.005, // fuser + drum wear with heavy use
    baseQualityModifier: 0.90,
    footprintM2:         2,
    basePriceUah:        18_000,
  },
  'EQ-PROJECTOR': {
    nameUa:              'Проєктор',
    energyConsumptionKw: 0.35,
    wearRatePerTick:     0.004, // lamp hours are finite
    baseQualityModifier: 0.92,
    footprintM2:         10,
    basePriceUah:        22_000,
  },
  'EQ-SERVER': {
    nameUa:              'Сервер',
    energyConsumptionKw: 0.40,
    wearRatePerTick:     0.003, // 24/7 operation → steady wear, but servers are built for it
    baseQualityModifier: 1.0,
    footprintM2:         5,
    basePriceUah:        80_000,
  },
  'EQ-PBXPHONE': {
    nameUa:              'АТС та телефонія',
    energyConsumptionKw: 0.10,
    wearRatePerTick:     0.002,
    baseQualityModifier: 1.0,
    footprintM2:         2,
    basePriceUah:        15_000,
  },
  'EQ-AIRCON': {
    nameUa:              'Кондиціонер',
    energyConsumptionKw: 2.00, // compressor-driven; largest single draw in office
    wearRatePerTick:     0.005, // seasonal cycling, filter/compressor wear
    baseQualityModifier: 0.95,
    footprintM2:         2,
    basePriceUah:        28_000,
  },
  'EQ-COFFEEMACH': {
    nameUa:              'Кавова машина',
    energyConsumptionKw: 1.20,
    wearRatePerTick:     0.006, // pump + boiler scale buildup
    baseQualityModifier: 1.0,
    footprintM2:         3,
    basePriceUah:        35_000,
  },
  'EQ-OFFICESAFE': {
    nameUa:              'Офісний сейф',
    energyConsumptionKw: 0.02,
    wearRatePerTick:     0.001, // virtually no wear
    baseQualityModifier: 1.0,
    footprintM2:         2,
    basePriceUah:        12_000,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Combined export
// ─────────────────────────────────────────────────────────────────────────────

export const EQUIPMENT_CATALOG: Readonly<Record<string, EquipmentSpec>> = {
  ...FACTORY_SPECS,
  ...FOOD_SPECS,
  ...TEXTILE_SPECS,
  ...WAREHOUSE_SPECS,
  ...RETAIL_SPECS,
  ...OFFICE_SPECS,
} as const;

/** Fallback spec when a SKU is not found in the catalog. */
export const DEFAULT_EQUIPMENT_SPEC: EquipmentSpec = {
  nameUa:              'Обладнання',
  energyConsumptionKw: 5.0,
  wearRatePerTick:     0.005,
  baseQualityModifier: 1.0,
  footprintM2:         30,
  basePriceUah:        50_000,
};
