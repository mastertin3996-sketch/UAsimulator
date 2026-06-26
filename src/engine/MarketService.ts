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
        select: {
          id: true, playerId: true, pricePerUnit: true, qualityMin: true,
          quantityTotal: true, quantityFilled: true, isStateOrder: true,
        },
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

          // Держзамовлення — бонус репутації продавцю +0.3 (max 10)
          if (buy.isStateOrder) {
            const seller = await tx.player.findUniqueOrThrow({ where: { id: sell.playerId }, select: { reputationScore: true } });
            const newRep = Math.min(10, seller.reputationScore + 0.3);
            await tx.player.update({ where: { id: sell.playerId }, data: { reputationScore: newRep } });
            await tx.notification.create({
              data: {
                playerId: sell.playerId,
                type: 'MARKET_FILLED',
                title: '🏛️ Держзамовлення виконано!',
                body: `Ви поставили ${tradeQty} × ${tradeQty} ₴${sellPrice.toFixed(0)}/од. Репутація +0.3`,
                entityId: sell.id,
              },
            });
          }
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

  /**
   * NPC купує у виробників через ринок SELL-ордерів.
   * Об'єднує попит по всіх містах для кожного продукту і скуповує доступні SELL-ордери
   * за ціною ≤ referencePrice, симулюючи кінцевих споживачів та дистриб'юторів.
   */
  async matchNpcMarketOrders(): Promise<number> {
    // Aggregate total NPC demand by product across all cities
    const demands = await this.prisma.npcDemand.groupBy({
      by:     ['productId'],
      _sum:   { baseUnitsPerDay: true },
      _avg:   { referencePrice: true },
    });

    let totalTraded = 0;

    for (const d of demands) {
      const totalDemand  = d._sum.baseUnitsPerDay ?? 0;
      const refPrice     = new Decimal(String(d._avg.referencePrice ?? 0));
      if (totalDemand <= 0 || refPrice.lte(0)) continue;

      // Find cheapest SELL orders for this product at or below reference price
      const sells = await this.prisma.marketOrder.findMany({
        where: {
          productId:    d.productId,
          type:         'SELL',
          status:       { in: ['OPEN', 'PARTIALLY_FILLED'] },
          pricePerUnit: { lte: refPrice },
        },
        orderBy: [{ pricePerUnit: 'asc' }, { createdAt: 'asc' }],
        take: 20,
      });

      let remaining = totalDemand;

      for (const sell of sells) {
        if (remaining <= 0.001) break;

        const available  = sell.quantityTotal - sell.quantityFilled;
        const tradeQty   = Math.min(available, remaining);
        if (tradeQty <= 0.001) continue;

        const price      = new Decimal(sell.pricePerUnit.toString());
        const tradeValue = price.times(tradeQty);

        // Credit seller
        const seller = await this.prisma.player.findUnique({
          where:  { id: sell.playerId },
          select: { cashBalance: true },
        });
        if (!seller) continue;

        const sellerBal      = new Decimal(seller.cashBalance.toString());
        const sellerBalAfter = sellerBal.plus(tradeValue);
        const newFilled      = sell.quantityFilled + tradeQty;
        const isFilled       = newFilled >= sell.quantityTotal - 0.001;

        await this.prisma.$transaction(async (tx) => {
          // Update sell order
          await tx.marketOrder.update({
            where: { id: sell.id },
            data: {
              quantityFilled: newFilled,
              status:   isFilled ? 'FILLED' : 'PARTIALLY_FILLED',
              filledAt: isFilled ? new Date() : null,
            },
          });

          // Decrement seller's player inventory escrow
          await tx.playerInventory.updateMany({
            where: { playerId: sell.playerId, productId: d.productId },
            data:  { quantity: { decrement: tradeQty } },
          });

          // Credit seller balance + transaction record
          await tx.player.update({
            where: { id: sell.playerId },
            data:  { cashBalance: sellerBalAfter },
          });
          await tx.financialTransaction.create({
            data: {
              playerId:      sell.playerId,
              type:          'NPC_SALE',
              amountUah:     tradeValue,
              balanceBefore: sellerBal,
              balanceAfter:  sellerBalAfter,
              description:   `NPC купівля: ${tradeQty.toFixed(1)} од. @ ₴${price.toFixed(0)}/од.`,
              referenceId:   sell.id,
            },
          });

          // Notification if fully filled
          if (isFilled) {
            await tx.notification.create({
              data: {
                playerId: sell.playerId,
                type:     'ORDER_FILLED',
                title:    'Ордер виконано',
                body:     `NPC викупив ${tradeQty.toFixed(0)} од. @ ₴${price.toFixed(0)}/од.`,
                entityId: null,
              },
            }).catch(() => {});
          }
        });

        remaining   -= tradeQty;
        totalTraded += tradeQty;
      }
    }

    return totalTraded;
  }

  /** Поповнює ордери і інвентар ДержПром якщо залишок < 20% від початкового. */
  async replenishDerzhprom(): Promise<void> {
    const player = await this.prisma.player.findFirst({
      where: { username: 'derzhprom', isNpcSeller: true },
      select: { id: true },
    });
    if (!player) return;

    const MIN_RATIO = 0.20; // поповнюємо коли залишок < 20%
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    const orders = await this.prisma.marketOrder.findMany({
      where:  { playerId: player.id, status: { in: ['OPEN', 'PARTIALLY_FILLED'] } },
      select: { id: true, productId: true, quantityTotal: true, quantityFilled: true, pricePerUnit: true, quality: true, resourceType: true },
    });

    for (const order of orders) {
      const remaining = order.quantityTotal - order.quantityFilled;
      if (remaining / order.quantityTotal > MIN_RATIO) continue;

      const refillQty = order.quantityTotal; // відновити до початкового обсягу

      // Скасувати вичерпаний ордер
      await this.prisma.marketOrder.update({
        where: { id: order.id },
        data:  { status: 'CANCELLED' },
      });

      // Поповнити playerInventory
      await this.prisma.playerInventory.upsert({
        where:  { playerId_productId: { playerId: player.id, productId: order.productId } },
        update: { quantity: { increment: refillQty } },
        create: { playerId: player.id, productId: order.productId, quantity: refillQty, avgQuality: order.quality ?? 7 },
      });

      // Новий ордер
      await this.prisma.marketOrder.create({
        data: {
          playerId:       player.id,
          productId:      order.productId,
          resourceType:   order.resourceType,
          type:           'SELL',
          status:         'OPEN',
          pricePerUnit:   order.pricePerUnit,
          quality:        order.quality,
          quantityTotal:  refillQty,
          quantityFilled: 0,
          expiresAt,
        },
      });
    }
  }

  /**
   * Генерує держзамовлення від ДержПром — BUY-ордери з премією +20% до referencePrice.
   * Запускається кожні 24 тіки (ігровий тиждень).
   */
  async generateStateOrders(): Promise<number> {
    const derzhprom = await this.prisma.player.findFirst({
      where: { username: 'derzhprom', isNpcSeller: true },
      select: { id: true },
    });
    if (!derzhprom) return 0;

    // Скасувати попередні невиконані держзамовлення
    await this.prisma.marketOrder.updateMany({
      where: { playerId: derzhprom.id, isStateOrder: true, status: { in: ['OPEN', 'PARTIALLY_FILLED'] } },
      data:  { status: 'CANCELLED' },
    });

    // Продукти для держзамовлень (реальні товари, не сировина і не обладнання)
    const TARGET_SKUS = [
      'FG-BREAD', 'FG-MILK', 'FG-PASTA', 'FG-SUNOIL',
      'SF-FLOUR', 'SF-SUGAR', 'SF-STEEL', 'SF-PLANKS',
      'CM-BRICK', 'CM-CEMENT', 'CM-REBAR',
    ];

    // Беремо 4 випадкових продукти
    const shuffled = TARGET_SKUS.sort(() => Math.random() - 0.5).slice(0, 4);
    const products = await this.prisma.product.findMany({
      where: { sku: { in: shuffled } },
      select: { id: true, sku: true, nameUa: true },
    });

    const npcPrices = await this.prisma.npcDemand.groupBy({
      by: ['productId'],
      where: { productId: { in: products.map(p => p.id) } },
      _avg: { referencePrice: true },
    });
    const priceMap = new Map(npcPrices.map(n => [n.productId, Number(n._avg.referencePrice ?? 0)]));

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000 * 3); // 3 доби (≈24 тіки)
    let created = 0;

    for (const product of products) {
      const ref = priceMap.get(product.id) ?? 30;
      const buyPrice  = +(ref * 1.20).toFixed(2); // +20% до ринку
      const quantity  = Math.round(200 + Math.random() * 800);

      await this.prisma.marketOrder.create({
        data: {
          playerId:       derzhprom.id,
          productId:      product.id,
          resourceType:   product.sku,
          type:           'BUY',
          status:         'OPEN',
          pricePerUnit:   buyPrice,
          qualityMin:     6.0,
          quantityTotal:  quantity,
          quantityFilled: 0,
          isStateOrder:   true,
          expiresAt,
        },
      });
      created++;
    }

    return created;
  }
}
