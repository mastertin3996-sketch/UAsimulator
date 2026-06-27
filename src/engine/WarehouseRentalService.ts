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
}
