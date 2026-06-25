import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import type { TradeResult, NpcSaleResult } from '../types';
import { weightedAvgQuality } from '../types';

export class MarketService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Переводить прострочені ринкові ордери у статус EXPIRED. */
  async expireStaleOrders(): Promise<number> {
    const result = await this.prisma.marketOrder.updateMany({
      where: {
        status:    { in: ['OPEN', 'PARTIALLY_FILLED'] },
        expiresAt: { lt: new Date() },
      },
      data: { status: 'EXPIRED' },
    });
    return result.count;
  }

  /**
   * Матчинг ордерів B2B — пріоритет ціна-час.
   *
   * Алгоритм:
   *  1. Sell — сортування за ціною ASC, потім createdAt ASC
   *  2. Buy  — сортування за ціною DESC, потім createdAt ASC
   *  3. Поки sell.price ≤ buy.price → виконати угоду за sell.price (maker = seller)
   *
   * Ціни зберігаються як Decimal — порівнюємо через Decimal.js (.lessThanOrEqualTo).
   * Сума угоди (tradeValue = qty × price) — Decimal, щоб уникнути накопичення похибки
   * при великих угодах (напр. 50 000 т × 8 000 UAH/т = 400 000 000 UAH).
   */
  async matchOrders(): Promise<TradeResult[]> {
    const products = await this.prisma.product.findMany({
      where: {
        marketOrders: {
          some: { status: { in: ['OPEN', 'PARTIALLY_FILLED'] } },
        },
      },
      select: { id: true },
    });

    const allTrades: TradeResult[] = [];
    const filledNotifs: { playerId: string; orderType: string; productId: string; qty: number; price: number; unit?: string; name?: string }[] = [];

    for (const { id: productId } of products) {
      const sells = await this.prisma.marketOrder.findMany({
        where:   { productId, type: 'SELL', status: { in: ['OPEN', 'PARTIALLY_FILLED'] } },
        orderBy: [{ pricePerUnit: 'asc' }, { createdAt: 'asc' }],
      });

      const buys = await this.prisma.marketOrder.findMany({
        where:   { productId, type: 'BUY',  status: { in: ['OPEN', 'PARTIALLY_FILLED'] } },
        orderBy: [{ pricePerUnit: 'desc' }, { createdAt: 'asc' }],
      });

      let si = 0;
      let bi = 0;

      while (si < sells.length && bi < buys.length) {
        const sell = sells[si];
        const buy  = buys[bi];

        const sellPrice = new Decimal(sell.pricePerUnit.toString());
        const buyPrice  = new Decimal(buy.pricePerUnit.toString());

        // Немає перетину цін
        if (sellPrice.greaterThan(buyPrice)) break;

        // Заборона само-трейдингу
        if (sell.playerId === buy.playerId) { bi++; continue; }

        // Фільтр якості
        const sellQuality = sell.quality ?? 5;
        if (buy.qualityMin != null && sellQuality < buy.qualityMin) { si++; continue; }

        const sellRemaining = sell.quantityTotal - sell.quantityFilled;
        const buyRemaining  = buy.quantityTotal  - buy.quantityFilled;
        const tradeQty      = Math.min(sellRemaining, buyRemaining);

        // Сума угоди — Decimal: велике qty × ціна не втрачає копійки
        const tradeValue = sellPrice.times(tradeQty);

        // Перевірка ліквідності покупця
        const buyer        = await this.prisma.player.findUniqueOrThrow({ where: { id: buy.playerId } });
        const buyerBalance = new Decimal(buyer.cashBalance.toString());
        if (buyerBalance.lessThan(tradeValue)) { bi++; continue; }

        // Перевірка інвентаря продавця
        const sellerInv = await this.prisma.playerInventory.findUnique({
          where: { playerId_productId: { playerId: sell.playerId, productId } },
        });
        if ((sellerInv?.quantity ?? 0) < tradeQty - 0.001) { si++; continue; }

        // Атомарне виконання угоди
        await this.prisma.$transaction(async (tx) => {
          const now = new Date();

          const sellNewFilled = sell.quantityFilled + tradeQty;
          const buyNewFilled  = buy.quantityFilled  + tradeQty;

          await tx.marketOrder.update({
            where: { id: sell.id },
            data: {
              quantityFilled: sellNewFilled,
              status: sellNewFilled >= sell.quantityTotal - 0.001 ? 'FILLED' : 'PARTIALLY_FILLED',
              filledAt: sellNewFilled >= sell.quantityTotal - 0.001 ? now : null,
            },
          });

          await tx.marketOrder.update({
            where: { id: buy.id },
            data: {
              quantityFilled: buyNewFilled,
              status: buyNewFilled >= buy.quantityTotal - 0.001 ? 'FILLED' : 'PARTIALLY_FILLED',
              filledAt: buyNewFilled >= buy.quantityTotal - 0.001 ? now : null,
            },
          });

          await tx.marketTrade.create({
            data: {
              sellOrderId:  sell.id,
              buyOrderId:   buy.id,
              quantity:     tradeQty,
              pricePerUnit: sellPrice,    // Decimal ✓
              quality:      sellQuality,
              executedAt:   now,
            },
          });

          // Баланс продавця — перечитуємо всередині транзакції (race-condition safety)
          const sellerFresh   = await tx.player.findUniqueOrThrow({ where: { id: sell.playerId } });
          const sellerBalance = new Decimal(sellerFresh.cashBalance.toString());

          // Товар: продавець → покупець
          await tx.playerInventory.update({
            where: { playerId_productId: { playerId: sell.playerId, productId } },
            data:  { quantity: { decrement: tradeQty } },
          });

          const buyerInv = await tx.playerInventory.findUnique({
            where: { playerId_productId: { playerId: buy.playerId, productId } },
          });
          if (buyerInv) {
            const newAvgQ = weightedAvgQuality([
              { quantity: buyerInv.quantity, quality: buyerInv.avgQuality },
              { quantity: tradeQty,          quality: sellQuality },
            ]);
            await tx.playerInventory.update({
              where: { playerId_productId: { playerId: buy.playerId, productId } },
              data:  { quantity: { increment: tradeQty }, avgQuality: newAvgQ },
            });
          } else {
            await tx.playerInventory.create({
              data: { playerId: buy.playerId, productId, quantity: tradeQty, avgQuality: sellQuality },
            });
          }

          // Переказ коштів
          await tx.player.update({
            where: { id: sell.playerId },
            data:  { cashBalance: { increment: tradeValue } }, // Decimal ✓
          });
          await tx.player.update({
            where: { id: buy.playerId },
            data:  { cashBalance: { decrement: tradeValue } }, // Decimal ✓
          });

          // Записи в журнал
          await tx.financialTransaction.create({
            data: {
              playerId:      sell.playerId,
              type:          'MARKET_SALE',
              amountUah:     tradeValue,                        // Decimal ✓
              balanceBefore: sellerBalance,                     // Decimal ✓
              balanceAfter:  sellerBalance.plus(tradeValue),   // Decimal ✓
              description:   `B2B продаж: ${tradeQty} × ${productId} @ ₴${sellPrice.toFixed(2)}`,
              referenceId:   sell.id,
            },
          });
          await tx.financialTransaction.create({
            data: {
              playerId:      buy.playerId,
              type:          'MARKET_PURCHASE',
              amountUah:     tradeValue.negated(),              // Decimal ✓
              balanceBefore: buyerBalance,                      // Decimal ✓
              balanceAfter:  buyerBalance.minus(tradeValue),   // Decimal ✓
              description:   `B2B купівля: ${tradeQty} × ${productId} @ ₴${sellPrice.toFixed(2)}`,
              referenceId:   buy.id,
            },
          });
        });

        sells[si] = { ...sell, quantityFilled: sell.quantityFilled + tradeQty };
        buys[bi]  = { ...buy,  quantityFilled: buy.quantityFilled  + tradeQty };

        allTrades.push({
          sellOrderId:    sell.id,
          buyOrderId:     buy.id,
          quantity:       tradeQty,
          pricePerUnit:   sell.pricePerUnit,
          quality:        sellQuality,
          sellerRevenue:  tradeValue.toNumber(),
          buyerCost:      tradeValue.toNumber(),
          sellerPlayerId: sell.playerId,
          buyerPlayerId:  buy.playerId,
          productId,
        });

        const sellDone = sells[si].quantityFilled + (sells[si].quantityFilled >= sells[si].quantityTotal - 0.001 ? 0 : 0);
        if (sells[si].quantityFilled >= sells[si].quantityTotal - 0.001) {
          filledNotifs.push({ playerId: sells[si].playerId, orderType: 'SELL', productId, qty: sells[si].quantityTotal, price: Number(sells[si].pricePerUnit) });
          si++;
        }
        if (buys[bi].quantityFilled >= buys[bi].quantityTotal - 0.001) {
          filledNotifs.push({ playerId: buys[bi].playerId, orderType: 'BUY', productId, qty: buys[bi].quantityTotal, price: Number(buys[bi].pricePerUnit) });
          bi++;
        }
        void sellDone;
      }
    }

    // Batch create fill notifications
    if (filledNotifs.length > 0) {
      const productIds = [...new Set(filledNotifs.map(n => n.productId))];
      const prods = await this.prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, nameUa: true, unit: true } });
      const prodMap = new Map(prods.map(p => [p.id, p]));
      await Promise.all(filledNotifs.map(n => {
        const p = prodMap.get(n.productId);
        return this.prisma.notification.create({ data: {
          playerId: n.playerId,
          type:     'ORDER_FILLED',
          title:    'Ордер виконано',
          body:     `${n.orderType}-ордер ${p?.nameUa ?? n.productId}: ${n.qty} ${p?.unit ?? ''} @ ₴${n.price.toFixed(0)}/од.`,
          entityId: null,
        }}).catch(() => {});
      }));
    }

    return allTrades;
  }

  /**
   * Обробляє NPC-попит у роздрібних магазинах гравця.
   *
   * demand = baseUnitsPerDay
   *        × (referencePrice / listedPrice)^|priceElasticity|
   *        × qualityFactor
   *        × city.demandCoefficient
   *
   * referencePrice — Decimal (UAH), конвертується у number для формули попиту
   * (формула попиту — безрозмірна математика, не фін. розрахунок).
   * revenue — Decimal для запису в БД.
   */
  async processNpcSales(playerId: string, tickNumber: bigint): Promise<NpcSaleResult[]> {
    const retailShops = await this.prisma.enterprise.findMany({
      where:   { playerId, type: 'RETAIL_STORE', isOperational: true },
      include: {
        inventory: true,
        landPlot:  { include: { city: true } },
      },
    });

    const results: NpcSaleResult[] = [];

    for (const shop of retailShops) {
      const city    = shop.landPlot.city;
      const demands = await this.prisma.npcDemand.findMany({ where: { cityId: city.id } });

      for (const demand of demands) {
        const inv = shop.inventory.find(i => i.productId === demand.productId);
        if (!inv || inv.quantity < 0.001) continue;

        // referencePrice — Decimal, конвертуємо у number лише для розрахунку попиту
        const refPrice    = new Decimal(demand.referencePrice.toString()).toNumber();
        const listedPrice = refPrice;
        const qualityFactor =
          demand.qualityWeight * (inv.avgQuality / 10) + (1 - demand.qualityWeight);

        // city.demandCoefficient — Float (вже number, касту не потрібно)
        const demandQty = demand.baseUnitsPerDay
          * Math.pow(refPrice / listedPrice, Math.abs(demand.priceElasticity))
          * qualityFactor
          * city.demandCoefficient;

        const actualSold = Math.min(demandQty, inv.quantity);
        if (actualSold < 0.001) continue;

        // revenue — Decimal: qty (number) × price (number → Decimal)
        const revenue       = new Decimal(listedPrice).times(actualSold);
        const player        = await this.prisma.player.findUniqueOrThrow({ where: { id: playerId } });
        const balanceBefore = new Decimal(player.cashBalance.toString());
        const balanceAfter  = balanceBefore.plus(revenue);

        await this.prisma.$transaction([
          this.prisma.enterpriseInventory.update({
            where: { id: inv.id },
            data:  { quantity: { decrement: actualSold } },
          }),
          this.prisma.player.update({
            where: { id: playerId },
            data:  { cashBalance: { increment: revenue } }, // Decimal ✓
          }),
          this.prisma.financialTransaction.create({
            data: {
              playerId,
              type:          'NPC_SALE',
              amountUah:     revenue,          // Decimal ✓
              balanceBefore,                   // Decimal ✓
              balanceAfter,                    // Decimal ✓
              description:
                `NPC роздріб: ${actualSold.toFixed(2)} × ${demand.productId} у ${city.name}`,
              referenceId: demand.id,
            },
          }),
        ]);

        inv.quantity -= actualSold;

        results.push({
          enterpriseId:   shop.id,
          productId:      demand.productId,
          unitsSold:      actualSold,
          revenueUah:     revenue.toNumber(),
          avgQualitySold: inv.avgQuality,
        });
      }
    }

    return results;
  }
}
