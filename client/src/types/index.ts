// ─── Enums (mirror Prisma schema) ────────────────────────────────────────────

export type EquipmentStatus  = 'NEW' | 'OPERATIONAL' | 'WORN' | 'BROKEN';
export type EnterpriseType   = 'OFFICE' | 'AGRO_FARM' | 'TEXTILE_FACTORY' | 'FOOD_PROCESSING' | 'RETAIL_STORE' | 'WAREHOUSE' | 'LOGISTICS_HUB';
export type LandStatus       = 'AVAILABLE' | 'OWNED' | 'LEASED';
export type MarketOrderStatus = 'OPEN' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED' | 'EXPIRED';
export type Profession =
  | 'ACCOUNTANT' | 'MANAGER' | 'OPERATOR' | 'ENGINEER' | 'AGRONOMIST'
  | 'LOADER' | 'DRIVER' | 'SECURITY_GUARD' | 'CLEANER' | 'SALES_REP'
  | 'IT_SPECIALIST' | 'LAWYER' | 'HR_SPECIALIST' | 'TECHNICIAN' | 'QUALITY_CONTROLLER';

// ─── Core domain models ───────────────────────────────────────────────────────

export interface Player {
  id:              string;
  username:        string;
  companyName:     string;
  cashBalance:     number;   // UAH
  netWorth:        number;   // UAH
  creditRating:    number;   // 0–10
  reputationScore: number;   // 0–10
  lastActiveAt:    string;
}

export interface City {
  id:                string;
  name:              string;
  nameUa:            string;
  region:            string;
  population:        number;
  wageBaselineUah:   number;
  wageCoefficient:   number;
  energyTariffUah:   number;
  demandCoefficient: number;
}

export interface Office {
  id:                          string;
  cityId:                      string;
  sizeM2:                      number;
  energyConsumptionKwhPerTick: number;
  monthlyRentUah:              number;
  isOperational:               boolean;
}

export interface LandPlot {
  id:                 string;
  cadastralNumber:    string;
  status:             LandStatus;
  totalAreaM2:        number;
  usedAreaM2:         number;
  monthlyLeaseCostUah: number;
  purchasePriceUah:   number;
}

export interface Equipment {
  id:                  string;
  name:                string;
  status:              EquipmentStatus;
  wearAndTear:         number;  // 0.0–1.0
  wearRatePerTick:     number;
  isBroken:            boolean;
  energyConsumptionKw: number;
  marketValueUah:      number;
  maintenanceCostUah:  number;
}

export interface Workshop {
  id:           string;
  name:         string;
  footprintM2:  number;
  maxCapacity:  number;   // units/day
  currentVolume: number;  // units/day
  isActive:     boolean;
  equipment:    Equipment[];
}

export interface Employee {
  id:          string;
  firstName:   string;
  lastName:    string;
  profession:  Profession;
  salaryUah:   number;
  mood:        number;       // 0.0–1.0
  efficiency:  number;       // 0.0–1.15
  isOnStrike:  boolean;
  lastPaidAt:  string | null;
}

export interface Enterprise {
  id:               string;
  name:             string;
  type:             EnterpriseType;
  isOperational:    boolean;
  footprintM2:      number;
  totalFloorAreaM2: number;
  usedFloorAreaM2:  number;
  workshops:        Workshop[];
  employees:        Employee[];
  // Derived in mock data for convenience
  cityId:           string;
  landPlotId:       string;
}

export interface MarketOrder {
  id:             string;
  resourceType:   string;
  resourceName:   string;
  type:           'SELL' | 'BUY';
  status:         MarketOrderStatus;
  pricePerUnit:   number;
  quality:        number;   // 0–10
  quantityTotal:  number;
  quantityFilled: number;
  expiresAt:      string;
  sellerName:     string;
}

export interface RetailStore {
  id:                  string;
  name:                string;
  cityName:            string;
  productName:         string;
  avgQuality:          number;   // 0–10
  retailPriceUah:      number;
  staffEfficiency:     number;   // 0.0–1.15
  attractivenessScore: number;   // higher = more NPC sales
  npcDemandUnitsPerDay: number;
  soldUnitsToday:      number;
  dailyRevenueUah:     number;
}

export interface TaxSummary {
  vatAccruedUah:      number;
  vatPaidUah:         number;
  citEstimateUah:     number;
  esvAccruedUah:      number;
  totalDebtUah:       number;
  nextDueTick:        number;
  currentTick:        number;
}

// ─── Aggregated "Hub" view ────────────────────────────────────────────────────

export interface CityHub {
  city:        City;
  office:      Office | null;
  landPlots:   LandPlot[];
  enterprises: Enterprise[];
}

// ─── Full dashboard state ─────────────────────────────────────────────────────

export interface DashboardState {
  player:           Player;
  cityHubs:         CityHub[];
  taxSummary:       TaxSummary;
  openMarketOrders: MarketOrder[];
  retailStores:     RetailStore[];
  currentTick:      number;
  gameDayLabel:     string;
}

// ─── Formatters ───────────────────────────────────────────────────────────────

export const fmt = {
  /** ₴1,250,000 */
  uah: (n: number) =>
    n.toLocaleString('uk-UA', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' ₴',

  /** ₴1,250,000.00 */
  uahDec: (n: number) =>
    n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₴',

  /** 75% */
  pct: (n: number, decimals = 0) => (n * 100).toFixed(decimals) + '%',

  /** 750 / 1 000 */
  fraction: (used: number, total: number) =>
    `${used.toLocaleString('uk-UA')} / ${total.toLocaleString('uk-UA')}`,

  /** quality 0-10 → one decimal */
  quality: (q: number) => q.toFixed(1),

  /** 8.5 kWh */
  kwh: (n: number) => n.toFixed(1) + ' кВт·год',
};
