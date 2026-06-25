import type {
  Player,
  Enterprise,
  Workshop,
  Equipment,
  Employee,
  Recipe,
  RecipeInput,
  RecipeOutput,
  EnterpriseInventory,
  NpcDemand,
  City,
  ConstructionProject,
  MarketOrder,
  Profession,
  EquipmentStatus,
} from '@prisma/client';
import type { Decimal } from '@prisma/client/runtime/library';

// ─── Composite types used across services ────────────────────────────────────

export type WorkshopWithRelations = Workshop & {
  equipment: Equipment[];
  productionOrders: Array<{
    id: string;
    recipeId: string;
    targetQuantity: number;
    completedQuantity: number;
    ticksRemaining: number;
    status: string;
    recipe: Recipe & {
      inputs: Array<RecipeInput & { product: { id: string; unit: string } }>;
      outputs: RecipeOutput[];
    };
  }>;
};

export type EnterpriseWithRelations = Enterprise & {
  workshops: WorkshopWithRelations[];
  employees: Employee[];
  inventory: EnterpriseInventory[];
};

export type PlayerWithBalance = Pick<Player, 'id' | 'cashBalance'>;

// ─── Production tick result ───────────────────────────────────────────────────

export interface ProductionResult {
  enterpriseId: string;
  workshopId: string;
  orderId: string;
  recipeId: string;
  unitsProduced: number;
  outputQuality: number;
  inputsConsumed: Array<{ productId: string; quantity: number }>;
  energyConsumedKwh: number;
  completed: boolean;
}

// ─── Equipment wear result ────────────────────────────────────────────────────

export interface DegradationResult {
  equipmentId:    string;
  wearBefore:     number;        // 0.0–1.0
  wearAfter:      number;        // 0.0–1.0
  statusBefore:   EquipmentStatus;
  statusAfter:    EquipmentStatus;
  failedSuddenly: boolean;       // раптовий збій (WORN → BROKEN без досягнення 1.0)
}

// ─── HR tick result ───────────────────────────────────────────────────────────

export interface HRTickResult {
  employeeId:         string;
  moodBefore:         number; // 0.0–1.0
  moodAfter:          number; // 0.0–1.0
  efficiency:         number; // 0.0–1.15
  wentOnStrike:       boolean;
  strikeResolved:     boolean;
  dailySalaryAccrued: number; // UAH (брутто/30)
}

// ─── Energy billing result ────────────────────────────────────────────────────

export interface EnergyBillingResult {
  cityId: string;
  totalKwh: number;
  tariffUah: Decimal;
  totalBillUah: number;
}

// ─── NPC sale result ──────────────────────────────────────────────────────────

export interface NpcSaleResult {
  enterpriseId: string;
  productId: string;
  unitsSold: number;
  revenueUah: number;
  avgQualitySold: number;
}

// ─── Market match result ──────────────────────────────────────────────────────

export interface TradeResult {
  sellOrderId:    string;
  buyOrderId:     string;
  quantity:       number;
  pricePerUnit:   Decimal;
  quality:        number;
  sellerRevenue:  number;
  buyerCost:      number;
  sellerPlayerId: string;
  buyerPlayerId:  string;
  productId:      string;
}

// ─── Tax period result ────────────────────────────────────────────────────────

export interface TaxBreakdown {
  vatUah: number;
  citUah: number;
  esvUah: number;
  pdfoUah: number;
  militaryTaxUah: number;
  totalUah: number;
}

// ─── Utility ──────────────────────────────────────────────────────────────────

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function weightedAvgQuality(
  batches: Array<{ quantity: number; quality: number }>,
): number {
  const totalQty = batches.reduce((s, b) => s + b.quantity, 0);
  if (totalQty === 0) return 0;
  return batches.reduce((s, b) => s + b.quality * b.quantity, 0) / totalQty;
}

export function decimalToNumber(d: Decimal | number): number {
  return typeof d === 'number' ? d : Number(d.toString());
}
