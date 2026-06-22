import type { DashboardState, Employee, Equipment, Enterprise } from '../types';

// ─── Допоміжні функції ────────────────────────────────────────────────────────

const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

function makeEquipment(id: number, name: string, wear: number): Equipment {
  const status =
    wear >= 1.0  ? 'BROKEN'     :
    wear >= 0.80 ? 'WORN'       :
    wear >= 0.10 ? 'OPERATIONAL' : 'NEW';
  return {
    id: uuid(id),
    name,
    status,
    wearAndTear:         wear,
    wearRatePerTick:     0.005,
    isBroken:            wear >= 1.0,
    energyConsumptionKw: 8.5,
    marketValueUah:      120_000 * (1 - wear * 0.7),
    maintenanceCostUah:  3_600,
  };
}

function makeEmployee(
  id: number,
  first: string,
  last: string,
  profession: Employee['profession'],
  salary: number,
  mood: number,
  onStrike = false,
): Employee {
  return {
    id: uuid(id),
    firstName:  first,
    lastName:   last,
    profession,
    salaryUah:  salary,
    mood:       Math.max(0, Math.min(1, mood)),
    efficiency: mood >= 0.85 ? 1.15 : mood >= 0.60 ? 1.0 : mood >= 0.40 ? 0.85 : 0.65,
    isOnStrike: onStrike,
    lastPaidAt: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
  };
}

// ─── Підприємство 1: Київський хлібозавод №1 (FOOD_PROCESSING) ───────────────

const kyivFactory: Enterprise = {
  id: uuid(101),
  name:             'Київський хлібозавод №1',
  type:             'FOOD_PROCESSING',
  isOperational:    true,
  footprintM2:      800,
  totalFloorAreaM2: 1_200,
  usedFloorAreaM2:  900,
  cityId:  uuid(1),
  landPlotId: uuid(201),
  workshops: [
    {
      id: uuid(301),
      name:          'Лінія випічки A',
      footprintM2:   400,
      maxCapacity:   800,
      currentVolume: 718,
      isActive:      true,
      equipment: [
        makeEquipment(401, 'Піч тунельна ПТ-120',    0.44),
        makeEquipment(402, 'Тістомісильна машина А1', 0.82),  // WORN — warning
        makeEquipment(403, 'Транспортер подачі',      0.07),  // NEW
      ],
    },
    {
      id: uuid(302),
      name:          'Лінія упаковки',
      footprintM2:   200,
      maxCapacity:   500,
      currentVolume: 384,
      isActive:      true,
      equipment: [
        makeEquipment(404, 'Пакувальна машина PM-3', 0.58),
        makeEquipment(405, 'Конвеєр пакування',      1.00),   // BROKEN — critical
      ],
    },
  ],
  employees: [
    makeEmployee(501, 'Олена',   'Коваль',     'OPERATOR',    18_500, 0.72),
    makeEmployee(502, 'Микола',  'Петренко',   'OPERATOR',    18_500, 0.68),
    makeEmployee(503, 'Василь',  'Іваненко',   'OPERATOR',    18_000, 0.31, true), // STRIKE
    makeEmployee(504, 'Ірина',   'Шевченко',   'ENGINEER',    28_000, 0.81),
    makeEmployee(505, 'Дмитро',  'Мороз',      'ACCOUNTANT',  22_000, 0.75),
    makeEmployee(506, 'Людмила', 'Бойко',      'MANAGER',     32_000, 0.88),
    makeEmployee(507, 'Андрій',  'Ткаченко',   'TECHNICIAN',  21_000, 0.45), // LOW mood
  ],
};

// ─── Підприємство 2: Галичина Текстиль (TEXTILE_FACTORY, Lviv) ───────────────

const lvivFactory: Enterprise = {
  id: uuid(102),
  name:             'Галичина Текстиль',
  type:             'TEXTILE_FACTORY',
  isOperational:    true,
  footprintM2:      600,
  totalFloorAreaM2: 900,
  usedFloorAreaM2:  630,
  cityId:  uuid(2),
  landPlotId: uuid(202),
  workshops: [
    {
      id: uuid(303),
      name:          'Ткацький цех №1',
      footprintM2:   350,
      maxCapacity:   600,
      currentVolume: 578,
      isActive:      true,
      equipment: [
        makeEquipment(406, 'Верстат ткацький ВТ-8А', 0.33),
        makeEquipment(407, 'Верстат ткацький ВТ-8Б', 0.41),
        makeEquipment(408, 'Нитковий агрегат',        0.22),
        makeEquipment(409, 'Фарбувальна камера',      0.63),
      ],
    },
  ],
  employees: [
    makeEmployee(508, 'Мар\'яна', 'Романів',   'OPERATOR',    16_800, 0.79),
    makeEmployee(509, 'Богдан',   'Лисенко',   'OPERATOR',    16_500, 0.83),
    makeEmployee(510, 'Оксана',   'Гнатюк',    'TECHNICIAN',  20_000, 0.92),
    makeEmployee(511, 'Ярослав',  'Федорів',   'ENGINEER',    27_500, 0.85),
    makeEmployee(512, 'Наталія',  'Пелех',     'MANAGER',     30_000, 0.76),
    makeEmployee(513, 'Степан',   'Костюк',    'QUALITY_CONTROLLER', 24_000, 0.69),
  ],
};

// ─── Підприємство 3: Дніпровські поля (AGRO_FARM, Dnipro) ───────────────────

const dniproFarm: Enterprise = {
  id: uuid(103),
  name:             'Дніпровські поля',
  type:             'AGRO_FARM',
  isOperational:    true,
  footprintM2:      2_000,
  totalFloorAreaM2: 2_400,
  usedFloorAreaM2:  800,
  cityId:  uuid(3),
  landPlotId: uuid(203),
  workshops: [
    {
      id: uuid(304),
      name:          'Зернозберігальний термінал',
      footprintM2:   800,
      maxCapacity:   1_000,
      currentVolume: 640,
      isActive:      true,
      equipment: [
        makeEquipment(410, 'Зерносушарка ЗС-50',   0.05),  // NEW
        makeEquipment(411, 'Транспортер зерна Т-4', 0.91),  // WORN — warning
      ],
    },
  ],
  employees: [
    makeEmployee(514, 'Сергій',   'Гречко',    'AGRONOMIST',  20_000, 0.74),
    makeEmployee(515, 'Тетяна',   'Кравець',   'OPERATOR',    17_500, 0.58), // below avg
    makeEmployee(516, 'Олексій',  'Сало',      'OPERATOR',    17_500, 0.53), // low
    makeEmployee(517, 'Надія',    'Завгородня','ACCOUNTANT',  22_000, 0.80),
    makeEmployee(518, 'Роман',    'Олійник',   'LOADER',      14_500, 0.62),
  ],
};

// ─── Склад у Дніпрі ──────────────────────────────────────────────────────────

const dniproWarehouse: Enterprise = {
  id: uuid(104),
  name:             'Склад логістики Дніпро',
  type:             'WAREHOUSE',
  isOperational:    true,
  footprintM2:      500,
  totalFloorAreaM2: 500,
  usedFloorAreaM2:  300,
  cityId:  uuid(3),
  landPlotId: uuid(203),
  workshops: [],
  employees: [
    makeEmployee(519, 'Павло', 'Гонта', 'LOADER',         14_500, 0.71),
    makeEmployee(520, 'Іван',  'Мусієнко', 'SECURITY_GUARD', 15_000, 0.78),
  ],
};

// ─── Повний стан дашборду ─────────────────────────────────────────────────────

export const initialDashboardState: DashboardState = {
  currentTick:  847,
  gameDayLabel: 'День 847 • Жовтень 2026',

  player: {
    id:              uuid(1),
    username:        'player_nadiya',
    companyName:     'Корпорація «Надія»',
    cashBalance:     1_247_830,
    netWorth:        4_752_440,
    creditRating:    7.8,
    reputationScore: 6.4,
    lastActiveAt:    new Date().toISOString(),
  },

  taxSummary: {
    vatAccruedUah:  84_600,
    vatPaidUah:     60_000,
    citEstimateUah: 38_250,
    esvAccruedUah:  48_730,
    totalDebtUah:   24_600,  // vatAccrued - vatPaid
    nextDueTick:    870,
    currentTick:    847,
  },

  cityHubs: [
    {
      city: {
        id: uuid(1), name: 'Kyiv', nameUa: 'Київ',
        region: 'Київська область', population: 2_967_000,
        wageBaselineUah: 20_300, wageCoefficient: 1.45,
        energyTariffUah: 4.32, demandCoefficient: 1.35,
      },
      office: {
        id: uuid(601), cityId: uuid(1),
        sizeM2: 120, energyConsumptionKwhPerTick: 38,
        monthlyRentUah: 85_000, isOperational: true,
      },
      landPlots: [{
        id: uuid(201), cadastralNumber: '3222480900:01:001:0042',
        status: 'OWNED', totalAreaM2: 1_500, usedAreaM2: 920,
        monthlyLeaseCostUah: 0, purchasePriceUah: 4_200_000,
      }],
      enterprises: [kyivFactory],
    },
    {
      city: {
        id: uuid(2), name: 'Lviv', nameUa: 'Львів',
        region: 'Львівська область', population: 717_000,
        wageBaselineUah: 16_800, wageCoefficient: 1.20,
        energyTariffUah: 4.18, demandCoefficient: 1.08,
      },
      office: {
        id: uuid(602), cityId: uuid(2),
        sizeM2: 65, energyConsumptionKwhPerTick: 22,
        monthlyRentUah: 42_000, isOperational: true,
      },
      landPlots: [{
        id: uuid(202), cadastralNumber: '4610136300:02:003:0018',
        status: 'OWNED', totalAreaM2: 1_000, usedAreaM2: 600,
        monthlyLeaseCostUah: 0, purchasePriceUah: 2_800_000,
      }],
      enterprises: [lvivFactory],
    },
    {
      city: {
        id: uuid(3), name: 'Dnipro', nameUa: 'Дніпро',
        region: 'Дніпропетровська область', population: 969_000,
        wageBaselineUah: 17_500, wageCoefficient: 1.25,
        energyTariffUah: 3.98, demandCoefficient: 1.12,
      },
      office: {
        id: uuid(603), cityId: uuid(3),
        sizeM2: 80, energyConsumptionKwhPerTick: 28,
        monthlyRentUah: 0, isOperational: true,
      },
      landPlots: [{
        id: uuid(203), cadastralNumber: '1210100000:05:002:0091',
        status: 'LEASED', totalAreaM2: 3_500, usedAreaM2: 2_500,
        monthlyLeaseCostUah: 28_000, purchasePriceUah: 0,
      }],
      enterprises: [dniproFarm, dniproWarehouse],
    },
  ],

  openMarketOrders: [
    {
      id: uuid(701),
      resourceType: 'RM-WHEAT',
      resourceName: 'Пшениця 2-го класу',
      type: 'SELL', status: 'OPEN',
      pricePerUnit: 8_800, quality: 7.5,
      quantityTotal: 500, quantityFilled: 120,
      expiresAt: new Date(Date.now() + 18 * 24 * 3600 * 1000).toISOString(),
      sellerName: 'Корпорація «Надія»',
    },
    {
      id: uuid(702),
      resourceType: 'FG-BREAD',
      resourceName: 'Хліб "Дарницький" (лот)',
      type: 'SELL', status: 'PARTIALLY_FILLED',
      pricePerUnit: 22_500, quality: 8.1,
      quantityTotal: 200, quantityFilled: 87,
      expiresAt: new Date(Date.now() + 8 * 24 * 3600 * 1000).toISOString(),
      sellerName: 'Корпорація «Надія»',
    },
    {
      id: uuid(703),
      resourceType: 'SF-FLOUR',
      resourceName: 'Борошно пшеничне в/с',
      type: 'BUY', status: 'OPEN',
      pricePerUnit: 12_400, quality: 7.0,
      quantityTotal: 300, quantityFilled: 0,
      expiresAt: new Date(Date.now() + 25 * 24 * 3600 * 1000).toISOString(),
      sellerName: 'ТОВ "АгроТрейд"',
    },
    {
      id: uuid(704),
      resourceType: 'CM-TIMBER',
      resourceName: 'Пиломатеріали (дошка обрізна)',
      type: 'BUY', status: 'OPEN',
      pricePerUnit: 6_200, quality: 6.5,
      quantityTotal: 150, quantityFilled: 0,
      expiresAt: new Date(Date.now() + 12 * 24 * 3600 * 1000).toISOString(),
      sellerName: 'ПП "Карпатліс"',
    },
    {
      id: uuid(705),
      resourceType: 'RM-SUNFLOWER',
      resourceName: 'Насіння соняшнику',
      type: 'SELL', status: 'OPEN',
      pricePerUnit: 14_200, quality: 8.8,
      quantityTotal: 80, quantityFilled: 0,
      expiresAt: new Date(Date.now() + 20 * 24 * 3600 * 1000).toISOString(),
      sellerName: 'Корпорація «Надія»',
    },
  ],

  retailStores: [
    {
      id: uuid(801),
      name:              'Хлібний кіоск №1 (Київ, Оболонь)',
      cityName:          'Київ',
      productName:       'Хліб "Дарницький"',
      avgQuality:        8.1,
      retailPriceUah:    68,
      staffEfficiency:   0.88,
      attractivenessScore: 2.84,
      npcDemandUnitsPerDay: 350,
      soldUnitsToday:    308,
      dailyRevenueUah:   20_944,
    },
    {
      id: uuid(802),
      name:              'Хлібний кіоск №2 (Київ, Позняки)',
      cityName:          'Київ',
      productName:       'Хліб "Дарницький"',
      avgQuality:        7.9,
      retailPriceUah:    68,
      staffEfficiency:   0.72,
      attractivenessScore: 2.31,
      npcDemandUnitsPerDay: 280,
      soldUnitsToday:    201,
      dailyRevenueUah:   13_668,
    },
    {
      id: uuid(803),
      name:              'Текстиль-Маркет (Львів, центр)',
      cityName:          'Львів',
      productName:       'Тканина бавовняна (рулон)',
      avgQuality:        8.4,
      retailPriceUah:    1_250,
      staffEfficiency:   0.96,
      attractivenessScore: 3.42,
      npcDemandUnitsPerDay: 45,
      soldUnitsToday:    41,
      dailyRevenueUah:   51_250,
    },
  ],
};
