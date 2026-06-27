import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const TENDER_ELIGIBLE_SKUS = ['FG-BREAD', 'FG-MILK', 'FG-MEAT', 'RM-WHEAT', 'FG-SUNOIL', 'FG-CHEESE', 'FG-SAUSAGE'];
const TENDER_DURATION_TICKS = 15n;
const TENDER_PRICE_PREMIUM  = 1.15; // 15% above NPC referencePrice
const MAX_OPEN_TENDERS      = 3;

export class TenderService {
  constructor(private readonly db: PrismaClient) {}

  async generateTenders(tickNumber: bigint): Promise<number> {
    const openCount = await this.db.tender.count({ where: { status: 'OPEN' } });
    if (openCount >= MAX_OPEN_TENDERS) return 0;

    const slotsToFill = MAX_OPEN_TENDERS - openCount;
    let created = 0;

    for (let i = 0; i < slotsToFill; i++) {
      const sku = TENDER_ELIGIBLE_SKUS[Math.floor(Math.random() * TENDER_ELIGIBLE_SKUS.length)];
      const product = await this.db.product.findFirst({ where: { sku } });
      if (!product) continue;

      // Check no open tender already exists for this SKU
      const exists = await this.db.tender.findFirst({ where: { productId: product.id, status: 'OPEN' } });
      if (exists) continue;

      // Base price from NPC demand (average across cities)
      const avgDemand = await this.db.npcDemand.aggregate({
        where: { productId: product.id },
        _avg:  { referencePrice: true },
      });
      const refPrice = Number(avgDemand._avg.referencePrice ?? 0);
      if (refPrice <= 0) continue;

      const pricePerUnit   = new Decimal(refPrice * TENDER_PRICE_PREMIUM);
      const quantityRequired = 200 + Math.floor(Math.random() * 600); // 200–800 units

      const TENDER_TITLES: Record<string, string> = {
        'FG-BREAD':   'Держзакупівля хліба для соціальних програм',
        'FG-MILK':    'Молоко для дитячих закладів',
        'FG-MEAT':    'М\'ясо для лікарень та армії',
        'RM-WHEAT':   'Пшениця до держрезерву',
        'FG-SUNOIL':  'Олія для держрезерву',
        'FG-CHEESE':  'Сир для шкільного харчування',
        'FG-SAUSAGE': 'Ковбаса для соціальних закладів',
      };

      await this.db.tender.create({
        data: {
          title:            TENDER_TITLES[sku] ?? `Держзакупівля ${product.nameUa}`,
          productId:        product.id,
          quantityRequired,
          pricePerUnitUah:  pricePerUnit,
          expiresAtTick:    tickNumber + TENDER_DURATION_TICKS,
          createdAtTick:    tickNumber,
          status:           'OPEN',
        },
      });
      created++;
    }

    return created;
  }

  async expireTenders(tickNumber: bigint): Promise<number> {
    const result = await this.db.tender.updateMany({
      where:  { status: 'OPEN', expiresAtTick: { lt: tickNumber } },
      data:   { status: 'EXPIRED' },
    });
    return result.count;
  }

  async fulfillTender(
    tenderId:   string,
    playerId:   string,
    enterpriseId: string,
  ): Promise<{ ok: boolean; message: string; revenueUah?: number }> {
    const tender = await this.db.tender.findFirst({
      where: { id: tenderId, status: 'OPEN' },
      include: { product: { select: { id: true, nameUa: true, sku: true } } },
    });
    if (!tender) return { ok: false, message: 'Тендер не знайдено або вже закрито' };

    const inv = await this.db.enterpriseInventory.findFirst({
      where: { enterpriseId, productId: tender.productId },
    });
    if (!inv || Number(inv.quantity) < tender.quantityRequired) {
      return {
        ok:      false,
        message: `Недостатньо товару: потрібно ${tender.quantityRequired} од., є ${Number(inv?.quantity ?? 0).toFixed(1)} од.`,
      };
    }

    const revenue = new Decimal(tender.quantityRequired).times(tender.pricePerUnitUah);

    await this.db.$transaction([
      // Deduct inventory
      this.db.enterpriseInventory.update({
        where: { id: inv.id },
        data:  { quantity: { decrement: tender.quantityRequired } },
      }),
      // Credit player
      this.db.player.update({
        where: { id: playerId },
        data:  { cashBalance: { increment: revenue }, isAccreditedSupplier: true },
      }),
      // Mark tender fulfilled
      this.db.tender.update({
        where: { id: tenderId },
        data:  { status: 'FULFILLED', winnerId: playerId },
      }),
      // Financial log
      this.db.financialLog.create({
        data: {
          playerId,
          category:    'REVENUE_RETAIL',
          amountUah:   revenue,
          description: `Тендер: ${tender.product.nameUa} × ${tender.quantityRequired} од. @ ₴${Number(tender.pricePerUnitUah).toFixed(2)}`,
          tickNumber:  BigInt(0),
        },
      }),
    ]);

    await this.db.notification.create({
      data: {
        playerId,
        type:  'MACRO_EVENT',
        title: 'Тендер виконано',
        body:  `"${tender.title}": отримано ₴${revenue.toFixed(0)} за ${tender.quantityRequired} од. ${tender.product.nameUa}. Статус постачальника підвищено.`,
      },
    }).catch(() => {});

    return { ok: true, message: 'Тендер виконано успішно', revenueUah: revenue.toNumber() };
  }
}
