/**
 * LogisticsService — manages warehouse capacity, inter-city freight,
 * and pending delivery settlement for UAeconomy.
 *
 * Responsibilities:
 *  • transferResources() — validate, deduct source stock, create PendingDelivery
 *  • processLogisticsTick() — advance deliveries, settle arrivals, apply spoilage
 *
 * Design constraints:
 *  • Only WAREHOUSE / LOGISTICS_HUB enterprises may have a Warehouse row.
 *  • Warehouse.usedVolumeM3 is the single source of truth; only this service
 *    writes it.  Production/Market services must not touch it directly.
 *  • All monetary values (freight cost, balance) → Decimal.
 *    Physical values (volume m³, weight kg, quantity) → number.
 *  • Delivery space is NOT pre-reserved at the destination.  If a warehouse
 *    fills up between dispatch and arrival, goods enter SPOILING status.
 */

import { Prisma, PrismaClient }  from '@prisma/client';
import { Decimal }               from '@prisma/client/runtime/library';
import { AppError }              from '../errors/AppError';
import {
  FREIGHT,
  FREIGHT_COST_PER_KM_UAH,
  getDistance,
  getDefaultRiskFactor,
}                                from '../constants/logistics';

// ── Domain errors ─────────────────────────────────────────────────────────────

class WarehouseNotFoundError extends AppError {
  constructor(cityId: string) {
    super(
      `No active warehouse in city '${cityId}'. Build a WAREHOUSE or LOGISTICS_HUB enterprise first.`,
      422, 'WAREHOUSE_NOT_FOUND', { cityId },
    );
  }
}

class InsufficientInventoryError extends AppError {
  constructor(productId: string, required: number, available: number) {
    super(
      `Insufficient inventory for product '${productId}': ` +
      `required ${required}, available ${available.toFixed(2)}.`,
      422, 'INSUFFICIENT_INVENTORY', { productId, required, available },
    );
  }
}

class WarehouseCapacityError extends AppError {
  constructor(warehouseId: string, requiredM3: number, freeM3: number) {
    super(
      `Destination warehouse '${warehouseId}' has insufficient space: ` +
      `need ${requiredM3.toFixed(2)} m³, available ${freeM3.toFixed(2)} m³.`,
      422, 'WAREHOUSE_CAPACITY_EXCEEDED', { warehouseId, requiredM3, freeM3 },
    );
  }
}

class NoRouteError extends AppError {
  constructor(fromCityId: string, toCityId: string) {
    super(
      `No logistics route found between '${fromCityId}' and '${toCityId}'.`,
      422, 'NO_ROUTE', { fromCityId, toCityId },
    );
  }
}

// ── Public return types ───────────────────────────────────────────────────────

export interface TransferReceipt {
  deliveryId:           string;
  fromCityId:           string;
  toCityId:             string;
  productId:            string;
  productNameUa:        string;
  quantity:             number;
  quality:              number;
  cargoVolumeM3:        number;
  distanceKm:           number;
  riskFactor:           number;
  deliveryTicks:        number;
  freightCostUah:       Decimal;
  estimatedArrivalTick: bigint;
}

export interface LogisticsTickSummary {
  tick:              bigint;
  transited:         number;  // still in transit (tick decremented)
  arrivals:          number;  // successfully deposited
  spoilageEvents:    number;  // arrived but warehouse full
  resolved:          number;  // SPOILING deliveries that finally fit
  failedDeliveries:  number;  // spoiled to 0
  totalSpoiledQty:   number;
}

// ── Prisma payload types ──────────────────────────────────────────────────────

const DELIVERY_INCLUDE = {
  fromWarehouse: true,
  toWarehouse:   true,
  product:       { select: { id: true, nameUa: true, unit: true, baseVolumeLitre: true } },
} satisfies Prisma.PendingDeliveryInclude;

type DeliveryWithWarehouses = Prisma.PendingDeliveryGetPayload<{ include: typeof DELIVERY_INCLUDE }>;

// ═══════════════════════════════════════════════════════════════════════════════

export class LogisticsService {
  constructor(private readonly db: PrismaClient) {}

  // ── Public: initiate inter-city freight ────────────────────────────────────

  async transferResources(
    playerId:   string,
    fromCityId: string,
    toCityId:   string,
    productId:  string,
    quantity:   number,
    quality:    number,
  ): Promise<TransferReceipt> {

    if (fromCityId === toCityId) {
      throw new AppError('Source and destination city must differ.', 400, 'SAME_CITY_TRANSFER');
    }
    if (quantity <= 0) {
      throw new AppError('Quantity must be positive.', 400, 'INVALID_QUANTITY', { quantity });
    }
    if (quality < 0 || quality > 10) {
      throw new AppError('Quality must be in range 0–10.', 400, 'INVALID_QUALITY', { quality });
    }

    // Validate administrative presence in both cities
    await this.requireActiveOffice(playerId, fromCityId);
    await this.requireActiveOffice(playerId, toCityId);

    const [fromWh, toWh, product, route] = await Promise.all([
      this.findWarehouse(playerId, fromCityId),
      this.findWarehouse(playerId, toCityId),
      this.db.product.findUniqueOrThrow({ where: { id: productId } }),
      this.resolveRoute(fromCityId, toCityId),
    ]);

    // ── Validation 1: source inventory ───────────────────────────────────────
    const srcSlot = await this.db.enterpriseInventory.findUnique({
      where: { enterpriseId_productId: { enterpriseId: fromWh.enterpriseId, productId } },
    });
    const availableQty = srcSlot?.quantity ?? 0;
    if (availableQty < quantity - 0.001) {
      throw new InsufficientInventoryError(productId, quantity, availableQty);
    }

    // ── Validation 2: destination capacity (advisory — not reserved) ──────────
    const cargoM3 = this.volumeM3(product.baseVolumeLitre, quantity);
    const freeM3  = toWh.maxVolumeM3 - toWh.usedVolumeM3;
    if (cargoM3 > freeM3 + 0.001) {
      throw new WarehouseCapacityError(toWh.id, cargoM3, freeM3);
    }

    // ── Cost & timing ─────────────────────────────────────────────────────────
    const freightCostUah   = this.calcFreightCost(route.distanceKm);
    const deliveryTicks    = this.calcDeliveryTicks(route.distanceKm, route.roadQuality);
    const lastTick         = await this.db.gameTick.findFirst({ orderBy: { tickNumber: 'desc' } });
    const currentTick      = lastTick?.tickNumber ?? 0n;
    const arrivalTick      = currentTick + BigInt(deliveryTicks);

    let deliveryId!: string;

    await this.db.$transaction(async (tx) => {
      // Re-read balance to guard against concurrent modifications
      const player = await tx.player.findUniqueOrThrow({
        where:  { id: playerId },
        select: { cashBalance: true },
      });
      const balance = new Decimal(player.cashBalance.toString());

      if (balance.lessThan(freightCostUah)) {
        throw new AppError(
          `Insufficient funds for freight: need ₴${freightCostUah.toFixed(2)}, ` +
          `have ₴${balance.toFixed(2)}.`,
          402, 'INSUFFICIENT_FUNDS',
          { required: freightCostUah.toFixed(2), available: balance.toFixed(2) },
        );
      }

      // 1. Deduct from source inventory
      const newQty = availableQty - quantity;
      if (newQty < 0.001) {
        await tx.enterpriseInventory.delete({
          where: { enterpriseId_productId: { enterpriseId: fromWh.enterpriseId, productId } },
        });
      } else {
        await tx.enterpriseInventory.update({
          where: { enterpriseId_productId: { enterpriseId: fromWh.enterpriseId, productId } },
          data:  { quantity: newQty },
        });
      }

      // 2. Reduce source warehouse volume
      await tx.warehouse.update({
        where: { id: fromWh.id },
        data:  { usedVolumeM3: { decrement: cargoM3 } },
      });

      // 3. Debit freight cost
      const newBalance = balance.minus(freightCostUah);
      await tx.player.update({ where: { id: playerId }, data: { cashBalance: newBalance } });

      await tx.financialTransaction.create({
        data: {
          playerId,
          type:          'FREIGHT_PAYMENT',
          amountUah:     freightCostUah.negated(),
          balanceBefore: balance,
          balanceAfter:  newBalance,
          description:
            `Транспортування ${quantity} ${product.unit} "${product.nameUa}" ` +
            `${fromCityId.slice(0, 8)} → ${toCityId.slice(0, 8)} ` +
            `(${route.distanceKm} км · ${deliveryTicks} тік)`,
        },
      });

      // 4. Create pending delivery record
      const delivery = await tx.pendingDelivery.create({
        data: {
          playerId,
          fromWarehouseId: fromWh.id,
          toWarehouseId:   toWh.id,
          productId,
          quantity,
          quality,
          volumeM3:        cargoM3,
          freightCostUah,
          ticksTotal:      deliveryTicks,
          ticksRemaining:  deliveryTicks,
          status:          'IN_TRANSIT',
        },
      });
      deliveryId = delivery.id;
    }, { timeout: 15_000 });

    return {
      deliveryId,
      fromCityId,
      toCityId,
      productId,
      productNameUa:        product.nameUa,
      quantity,
      quality,
      cargoVolumeM3:        cargoM3,
      distanceKm:           route.distanceKm,
      riskFactor:           route.riskFactor,
      deliveryTicks,
      freightCostUah,
      estimatedArrivalTick: arrivalTick,
    };
  }

  // ── Public: advance all active deliveries by one tick ─────────────────────
  //
  // Called once per global game tick AFTER per-player production/HR processing.
  // Optional playerId param lets you scope to one player (useful in tests).

  async processLogisticsTick(
    currentTick: bigint,
    playerId?:   string,
  ): Promise<LogisticsTickSummary> {

    const statusFilter = { in: ['IN_TRANSIT', 'SPOILING'] as ('IN_TRANSIT' | 'SPOILING')[] };
    const whereFilter: Prisma.PendingDeliveryWhereInput = {
      status: statusFilter,
      ...(playerId ? { playerId } : {}),
    };

    const deliveries = await this.db.pendingDelivery.findMany({
      where:   whereFilter,
      include: DELIVERY_INCLUDE,
      orderBy: { dispatchedAt: 'asc' },
    });

    const summary: LogisticsTickSummary = {
      tick: currentTick, transited: 0, arrivals: 0,
      spoilageEvents: 0, resolved: 0, failedDeliveries: 0, totalSpoiledQty: 0,
    };

    for (const d of deliveries) {
      if (d.status === 'IN_TRANSIT') {
        const remaining = d.ticksRemaining - 1;

        if (remaining > 0) {
          await this.db.pendingDelivery.update({
            where: { id: d.id },
            data:  { ticksRemaining: remaining },
          });
          summary.transited++;
        } else {
          // Arrived — attempt to deposit
          const arrived = await this.attemptDeposit(d, currentTick);
          if (arrived) summary.arrivals++;
          else         { summary.spoilageEvents++; summary.totalSpoiledQty += d.quantity * FREIGHT.SPOILAGE_RATE_PER_TICK; }
        }
      } else {
        // SPOILING — try again + apply another 10% loss
        const result = await this.processSpoilingDelivery(d, currentTick);
        summary.totalSpoiledQty += result.spoiledQty;
        if (result.resolved)    summary.resolved++;
        else if (result.failed) summary.failedDeliveries++;
        else                    summary.spoilageEvents++;
      }
    }

    // Secondary pass: spoil goods inside any warehouse that is over capacity
    // (could happen if warehouse.maxVolumeM3 was reduced externally)
    await this.spoilOverfillWarehouseContents(playerId);

    return summary;
  }

  // ── Private: deposit delivery into destination warehouse ──────────────────

  private async attemptDeposit(
    d:           DeliveryWithWarehouses,
    currentTick: bigint,
  ): Promise<boolean> {
    const toWh  = d.toWarehouse;
    const freeM3 = toWh.maxVolumeM3 - toWh.usedVolumeM3;

    if (d.volumeM3 > freeM3 + 0.001) {
      // Not enough room — apply initial spoilage penalty, set SPOILING
      const spoiledQty = d.quantity * FREIGHT.SPOILAGE_RATE_PER_TICK;
      const newQty     = d.quantity - spoiledQty;
      const newVolM3   = this.volumeM3(d.product.baseVolumeLitre, newQty);

      await this.db.pendingDelivery.update({
        where: { id: d.id },
        data: {
          ticksRemaining: 0,
          quantity:       newQty > 0.001 ? newQty : 0,
          volumeM3:       newVolM3,
          spoiledPct:     FREIGHT.SPOILAGE_RATE_PER_TICK * 100,
          status:         newQty > 0.001 ? 'SPOILING' : 'FAILED',
          arrivedAt:      new Date(),
        },
      });
      return false;
    }

    // Deposit the goods
    await this.db.$transaction(async (tx) => {
      await this.upsertInventory(tx, toWh.enterpriseId, d.productId, d.quantity, d.quality);

      await tx.warehouse.update({
        where: { id: toWh.id },
        data:  { usedVolumeM3: { increment: d.volumeM3 } },
      });

      await tx.pendingDelivery.update({
        where: { id: d.id },
        data:  { ticksRemaining: 0, status: 'DELIVERED', arrivedAt: new Date() },
      });
    });
    return true;
  }

  // ── Private: process one SPOILING delivery ────────────────────────────────

  private async processSpoilingDelivery(
    d:           DeliveryWithWarehouses,
    currentTick: bigint,
  ): Promise<{ spoiledQty: number; resolved: boolean; failed: boolean }> {

    const spoiledQty = d.quantity * FREIGHT.SPOILAGE_RATE_PER_TICK;
    const newQty     = d.quantity - spoiledQty;

    if (newQty < 0.001) {
      // Fully destroyed
      await this.db.pendingDelivery.update({
        where: { id: d.id },
        data:  { quantity: 0, volumeM3: 0, spoiledPct: 100, status: 'FAILED' },
      });
      return { spoiledQty, resolved: false, failed: true };
    }

    const newVolM3   = this.volumeM3(d.product.baseVolumeLitre, newQty);
    const toWh       = d.toWarehouse;
    const freeM3     = toWh.maxVolumeM3 - toWh.usedVolumeM3;

    if (newVolM3 <= freeM3 + 0.001) {
      // Space finally available — deliver the remainder
      await this.db.$transaction(async (tx) => {
        await this.upsertInventory(tx, toWh.enterpriseId, d.productId, newQty, d.quality);
        await tx.warehouse.update({
          where: { id: toWh.id },
          data:  { usedVolumeM3: { increment: newVolM3 } },
        });
        await tx.pendingDelivery.update({
          where: { id: d.id },
          data:  {
            quantity:  newQty,
            volumeM3:  newVolM3,
            spoiledPct: d.spoiledPct + FREIGHT.SPOILAGE_RATE_PER_TICK * 100,
            status:    'DELIVERED',
            arrivedAt: new Date(),
          },
        });
      });
      return { spoiledQty, resolved: true, failed: false };
    }

    // Still no room — reduce quantity, wait another tick
    await this.db.pendingDelivery.update({
      where: { id: d.id },
      data: {
        quantity:   newQty,
        volumeM3:   newVolM3,
        spoiledPct: d.spoiledPct + FREIGHT.SPOILAGE_RATE_PER_TICK * 100,
        status:     'SPOILING',
      },
    });
    return { spoiledQty, resolved: false, failed: false };
  }

  // ── Private: spoil goods in structurally overfilled warehouses ────────────
  //
  // Handles the case where maxVolumeM3 was administratively reduced (e.g. from
  // warehouse downsizing) so that usedVolumeM3 now exceeds capacity.

  private async spoilOverfillWarehouseContents(playerId?: string): Promise<void> {
    type OverfillRow = { id: string; enterpriseId: string };
    const clause = playerId
      ? Prisma.sql`AND w."playerId" = ${playerId}::uuid`
      : Prisma.sql``;

    const overfull = await this.db.$queryRaw<OverfillRow[]>`
      SELECT id, "enterpriseId"
      FROM   "Warehouse" w
      WHERE  w."usedVolumeM3" > w."maxVolumeM3" + 0.001
      ${clause}
    `;

    for (const wh of overfull) {
      const slots = await this.db.enterpriseInventory.findMany({
        where:   { enterpriseId: wh.enterpriseId },
        include: { product: { select: { baseVolumeLitre: true } } },
      });

      for (const slot of slots) {
        const spoiledQty  = slot.quantity * FREIGHT.SPOILAGE_RATE_PER_TICK;
        const newQty      = Math.max(0, slot.quantity - spoiledQty);
        const deltaVolM3  = this.volumeM3(slot.product.baseVolumeLitre, spoiledQty);

        await this.db.$transaction([
          this.db.enterpriseInventory.update({
            where: { id: slot.id },
            data:  { quantity: newQty },
          }),
          this.db.warehouse.update({
            where: { id: wh.id },
            data:  { usedVolumeM3: { decrement: deltaVolM3 } },
          }),
        ]);
      }
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async requireActiveOffice(playerId: string, cityId: string): Promise<void> {
    const office = await this.db.office.findFirst({
      where: { playerId, cityId, isOperational: true },
    });
    if (!office) {
      const city = await this.db.city.findUnique({
        where:  { id: cityId },
        select: { nameUa: true },
      });
      throw new AppError(
        `Активний офіс у місті "${city?.nameUa ?? cityId}" обов'язковий для міжрегіональної логістики.`,
        422, 'OFFICE_REQUIRED', { cityId },
      );
    }
  }

  private async findWarehouse(playerId: string, cityId: string) {
    const wh = await this.db.warehouse.findFirst({
      where: {
        playerId,
        cityId,
        isActive:   true,
        enterprise: { isOperational: true },
      },
    });
    if (!wh) throw new WarehouseNotFoundError(cityId);
    return wh;
  }

  private async resolveRoute(fromCityId: string, toCityId: string) {
    // 1. DB lookup (both directions)
    const dbRoute = await this.db.logisticsRoute.findFirst({
      where: {
        OR: [
          { fromCityId, toCityId },
          { fromCityId: toCityId, toCityId: fromCityId },
        ],
      },
    });
    if (dbRoute) return dbRoute;

    // 2. In-memory fallback using city English names
    const [fromCity, toCity] = await Promise.all([
      this.db.city.findUnique({ where: { id: fromCityId }, select: { name: true } }),
      this.db.city.findUnique({ where: { id: toCityId },   select: { name: true } }),
    ]);

    const distKm = fromCity && toCity
      ? getDistance(fromCity.name, toCity.name)
      : undefined;

    if (!distKm) throw new NoRouteError(fromCityId, toCityId);

    return {
      distanceKm:  distKm,
      riskFactor:  getDefaultRiskFactor(fromCity!.name, toCity!.name),
      roadQuality: 1.0,
    };
  }

  /** Convert product volume per unit (litres) × quantity → m³ */
  private volumeM3(baseVolumeLitre: number, quantity: number): number {
    if (baseVolumeLitre <= 0) return quantity * 0.002; // fallback 2 L/unit
    return (baseVolumeLitre * quantity) / 1000;
  }

  /**
   * Freight cost (UAH):
   *   max(MINIMUM, FREIGHT_COST_PER_KM × distanceKm)
   *
   * Road-quality multiplier is already baked into deliveryTicks;
   * cost stays the same regardless of road condition (fuel still burned).
   */
  private calcFreightCost(distanceKm: number): Decimal {
    const variable = new Decimal(FREIGHT_COST_PER_KM_UAH).times(distanceKm);
    const minimum  = new Decimal(FREIGHT.MINIMUM_FREIGHT_UAH);
    return variable.greaterThan(minimum) ? variable : minimum;
  }

  /**
   * Delivery time (game ticks):
   *   ceil(distanceKm / (EFFECTIVE_SPEED × roadQuality))
   *
   * roadQuality < 1.0 means the route is slower (damaged roads, checkpoints).
   * Minimum 1 tick regardless of distance.
   */
  private calcDeliveryTicks(distanceKm: number, roadQuality = 1.0): number {
    const effectiveSpeed = FREIGHT.EFFECTIVE_SPEED_KM_PER_TICK * Math.max(0.1, roadQuality);
    return Math.max(1, Math.ceil(distanceKm / effectiveSpeed));
  }

  /** Upsert EnterpriseInventory using a weighted-average quality merge. */
  private async upsertInventory(
    tx:          Prisma.TransactionClient,
    enterpriseId: string,
    productId:   string,
    quantity:    number,
    quality:     number,
  ): Promise<void> {
    const existing = await tx.enterpriseInventory.findUnique({
      where: { enterpriseId_productId: { enterpriseId, productId } },
    });

    if (existing) {
      const totalQty = existing.quantity + quantity;
      const avgQuality = totalQty > 0
        ? (existing.avgQuality * existing.quantity + quality * quantity) / totalQty
        : quality;
      await tx.enterpriseInventory.update({
        where: { id: existing.id },
        data:  { quantity: totalQty, avgQuality },
      });
    } else {
      await tx.enterpriseInventory.create({
        data: { enterpriseId, productId, quantity, avgQuality: quality },
      });
    }
  }
}
