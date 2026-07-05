import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export class WarehouseRentalService {
  constructor(private readonly db: PrismaClient) {}

  /** Charges tenants and credits owners for all active subscriptions each tick. */
  async processRentals(tickNumber: bigint): Promise<number> {
    const subs = await this.db.warehouseRentalSubscription.findMany({
      where:   { isActive: true },
      include: { offer: { select: { ownerId: true, pricePerTick: true, enterpriseId: true } } },
    });
    if (subs.length === 0) return 0;

    let processed = 0;

    for (const sub of subs) {
      const rent = new Decimal(sub.offer.pricePerTick.toString());

      const tenant = await this.db.player.findUnique({
        where:  { id: sub.tenantId },
        select: { cashBalance: true },
      });
      if (!tenant) continue;

      const balance = new Decimal(tenant.cashBalance.toString());

      // Auto-cancel if tenant can't pay
      if (balance.lessThan(rent)) {
        await this.db.warehouseRentalSubscription.update({
          where: { id: sub.id },
          data:  { isActive: false },
        });
        await this.db.notification.create({
          data: {
            playerId: sub.tenantId,
            type:     'MACRO_EVENT',
            title:    'Оренду складу скасовано',
            body:     `Недостатньо коштів для оплати оренди (₴${rent.toFixed(0)}/тік). Передплату анульовано.`,
          },
        }).catch(() => {});
        continue;
      }

      await this.db.$transaction([
        // Charge tenant
        this.db.player.update({
          where: { id: sub.tenantId },
          data:  { cashBalance: { decrement: rent } },
        }),
        // Credit owner
        this.db.player.update({
          where: { id: sub.offer.ownerId },
          data:  { cashBalance: { increment: rent } },
        }),
        // Financial log for tenant
        this.db.financialLog.create({
          data: {
            playerId:    sub.tenantId,
            category:    'EXPENSE_LEASE',
            amountUah:   rent.negated(),
            description: 'Оренда складу (щотічна)',
            tickNumber,
          },
        }),
      ]);

      processed++;
    }

    return processed;
  }

  // ── Wave 3: 3PL сервісний дохід ────────────────────────────────────────────
  /** SKU складської техніки, що дає обробні потужності (3PL). */
  static readonly HANDLING_SKUS = new Set(['EQ-RACKING', 'EQ-FORKLIFT', 'EQ-WMS', 'EQ-CLIMATE', 'EQ-COLDROOM']);
  static readonly HANDLING_PROFS = new Set(['WAREHOUSE_MANAGER', 'FORKLIFT_OPERATOR', 'INVENTORY_CLERK']);
  static readonly THREE_PL_BASE = 500;      // ₴/тік за одиницю обробної техніки
  static readonly THREE_PL_CAP  = 10_000;   // стеля доходу/тік на склад

  /**
   * Пасивний 3PL-дохід власникам складів, що інвестували в техніку+персонал
   * (обробка/зберігання для NPC-клієнтів). Склад без техніки/персоналу не заробляє.
   * Дзеркалить пасивний патерн агротуризму; без нової колонки, з жорсткою стелею.
   */
  async processStorageServices(tickNumber: bigint): Promise<number> {
    const warehouses = await this.db.enterprise.findMany({
      where:  { type: 'WAREHOUSE', isOperational: true, isSeized: false },
      select: {
        id: true, playerId: true, name: true,
        employees: { select: { profession: true, isOnStrike: true } },
        workshops: { select: { equipment: { select: { isBroken: true, wearAndTear: true, catalogProduct: { select: { sku: true } } } } } },
      },
    });
    if (warehouses.length === 0) return 0;

    let paid = 0;
    for (const wh of warehouses) {
      let handlingUnits = 0;
      for (const w of wh.workshops)
        for (const eq of w.equipment)
          if (!eq.isBroken && eq.wearAndTear < 1.0 && WarehouseRentalService.HANDLING_SKUS.has(eq.catalogProduct.sku))
            handlingUnits++;
      const staff = wh.employees.filter(e => !e.isOnStrike && WarehouseRentalService.HANDLING_PROFS.has(e.profession)).length;
      // Потрібні і техніка, і персонал — інакше 0 (склад без інвестицій не заробляє).
      if (handlingUnits === 0 || staff === 0) continue;

      const staffFactor = 1 + Math.min(staff, 4) * 0.15;   // до +60%
      const income = Math.min(
        WarehouseRentalService.THREE_PL_BASE * Math.min(handlingUnits, 5) * staffFactor,
        WarehouseRentalService.THREE_PL_CAP,
      );
      const rounded = Math.round(income);
      if (rounded <= 0) continue;

      await this.db.$transaction([
        this.db.player.update({ where: { id: wh.playerId }, data: { cashBalance: { increment: rounded } } }),
        this.db.financialLog.create({
          data: {
            playerId: wh.playerId, category: 'REVENUE_B2B', amountUah: rounded,
            description: `3PL-послуги складу "${wh.name}" (${handlingUnits} од. техніки, ${staff} персоналу)`,
            tickNumber,
          },
        }),
      ]);
      paid++;
    }
    return paid;
  }
}
