import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import type { TradeResult, NpcSaleResult } from '../types';
import { weightedAvgQuality } from '../types';

export class MarketService {
  private _derzhpromId: string | null = null;

  constructor(private readonly prisma: PrismaClient) {}

  private async getDerzhpromId(): Promise<string> {
    if (!this._derzhpromId) {
      const dp = await this.prisma.player.findFirst({ where: { username: 'derzhprom' }, select: { id: true } });
      this._derzhpromId = dp?.id ?? '';
    }
    return this._derzhpromId;
  }

  /** Переводить прострочені ринкові ордери у статус EXPIRED.
   *  Для SELL-ордерів — повертає незаповнений залишок з playerInventory в enterpriseInventory. */
  async expireStaleOrders(): Promise<number> {
    const stale = await this.prisma.marketOrder.findMany({
      where:  { status: { in: ['OPEN', 'PARTIALLY_FILLED'] }, expiresAt: { lt: new Date() } },
      select: { id: true, playerId: true, productId: true, type: true,
                quantityTotal: true, quantityFilled: true },
    });
    if (stale.length === 0) return 0;

    await this.prisma.marketOrder.updateMany({
      where: { id: { in: stale.map(o => o.id) } },
      data:  { status: 'EXPIRED' },
    });

    // Return unsold goods from playerInventory → first enterprise that holds this product
    for (const order of stale) {
      if (order.type !== 'SELL') continue;
      const remaining = order.quantityTotal - order.quantityFilled;
      if (remaining < 0.001) continue;

      await this.prisma.playerInventory.updateMany({
        where: { playerId: order.playerId, productId: order.productId },
        data:  { quantity: { decrement: remaining } },
      });

      const ent = await this.prisma.enterprise.findFirst({
        where:   { playerId: order.playerId, isOperational: true },
        select:  { id: true },
        orderBy: { id: 'asc' },
      });
      if (!ent) continue;

      await this.prisma.enterpriseInventory.upsert({
        where:  { enterpriseId_productId: { enterpriseId: ent.id, productId: order.productId } },
        update: { quantity: { increment: remaining } },
        create: { enterpriseId: ent.id, productId: order.productId, quantity: remaining, avgQuality: 7 },
      });
    }

    return stale.length;
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
        const buyer        = await this.prisma.player.findUniqueOrThrow({ where: { id: buy.playerId }, select: { id: true, cashBalance: true, isAccreditedSupplier: true } });
        const buyerBalance = new Decimal(buyer.cashBalance.toString());
        if (buyerBalance.lessThan(tradeValue)) { bi++; continue; }

        // ── Ліміт купівлі у ДержПром: ₴50,000/добу ──
        const isDerzhpromSell = sell.playerId === (await this.getDerzhpromId());
        if (isDerzhpromSell && !buy.isStateOrder) {
          const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
          const spent = await this.prisma.marketTrade.aggregate({
            _sum: { quantity: true },
            where: {
              sellOrder: { playerId: sell.playerId },
              buyOrder:  { playerId: buy.playerId },
              executedAt: { gte: since },
            },
          });
          const spentValue = (spent._sum.quantity ?? 0) * Number(sell.pricePerUnit);
          if (spentValue + tradeValue.toNumber() > 50_000) { bi++; continue; }
        }

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

          // ── Акредитований постачальник: кешбек 7% при купівлі у ДержПром ──
          const dpId = await this.getDerzhpromId();
          if (sell.playerId === dpId && buyer.isAccreditedSupplier) {
            const cashback = tradeValue.times(0.07);
            await tx.player.update({ where: { id: buy.playerId }, data: { cashBalance: { increment: cashback } } });
            await tx.notification.create({
              data: {
                playerId: buy.playerId,
                type: 'MARKET_FILLED',
                title: '⭐ Кешбек акредитованого постачальника',
                body: `Повернуто 7% = ₴${cashback.toFixed(0)} за купівлю у ДержПром`,
                entityId: buy.id,
              },
            });
          }

          // ── Держзамовлення — репутація +0.3 та акредитація продавця ──
          if (buy.isStateOrder) {
            const seller = await tx.player.findUniqueOrThrow({ where: { id: sell.playerId }, select: { reputationScore: true, isAccreditedSupplier: true } });
            const newRep = Math.min(10, seller.reputationScore + 0.3);
            await tx.player.update({
              where: { id: sell.playerId },
              data: { reputationScore: newRep, isAccreditedSupplier: true },
            });
            await tx.notification.create({
              data: {
                playerId: sell.playerId,
                type: 'MARKET_FILLED',
                title: '🏛️ Держзамовлення виконано!',
                body: `Поставлено ${tradeQty} ${tradeQty > 1 ? 'од' : 'од'}. Репутація +0.3${!seller.isAccreditedSupplier ? ' · Отримано статус ⭐ Акредитованого постачальника' : ''}`,
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

      // Завантажуємо RetailListing для цього магазину
      const listings = await this.prisma.retailListing.findMany({
        where: { enterpriseId: shop.id, isActive: true },
      });
      const listingMap = new Map(listings.map(l => [l.productId, Number(l.pricePerUnit)]));

      for (const demand of demands) {
        const inv = shop.inventory.find(i => i.productId === demand.productId);
        if (!inv || inv.quantity < 0.001) continue;

        const refPrice    = new Decimal(demand.referencePrice.toString()).toNumber();
        // Ціна: з RetailListing (гравець) або referencePrice
        const listedPrice = listingMap.get(demand.productId) ?? refPrice;
        const qualityFactor =
          demand.qualityWeight * (inv.avgQuality / 10) + (1 - demand.qualityWeight);

        const demandQty = demand.baseUnitsPerDay
          * Math.pow(refPrice / listedPrice, Math.abs(demand.priceElasticity))
          * qualityFactor
          * city.demandCoefficient;

        const actualSold = Math.min(demandQty, inv.quantity);
        if (actualSold < 0.001) continue;

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
            data:  { cashBalance: { increment: revenue } },
          }),
          this.prisma.financialTransaction.create({
            data: {
              playerId,
              type:          'NPC_SALE',
              amountUah:     revenue,
              balanceBefore,
              balanceAfter,
              description:
                `NPC роздріб: ${actualSold.toFixed(2)} × ${demand.productId} у ${city.name}`,
              referenceId: demand.id,
            },
          }),
          this.prisma.financialLog.create({
            data: {
              playerId,
              category:    'REVENUE_RETAIL',
              amountUah:   revenue,
              description: `Роздрібний продаж у "${shop.name}": ${actualSold.toFixed(1)} од.`,
              referenceId: shop.id,
              tickNumber,
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
  // Seasonal NPC demand multipliers [spring, summer, autumn, winter]
  private static readonly SEASONAL_NPC_DEMAND: Record<string, [number, number, number, number]> = {
    'FG-BREAD':        [1.0, 0.9, 1.0, 1.3],
    'FG-MILK':         [1.0, 0.8, 1.0, 1.2],
    'FG-PASTA':        [0.9, 0.8, 1.0, 1.2],
    'FG-SUNOIL':       [0.9, 1.3, 1.1, 0.8],
    'SF-SUGAR':        [0.9, 1.2, 1.1, 0.9],
    'SF-FLOUR':        [0.9, 0.9, 1.1, 1.2],
    'SF-CORN-STARCH':  [1.0, 1.1, 1.0, 0.9],
  };

  async matchNpcMarketOrders(tickNumber?: bigint): Promise<number> {
    const season = Math.floor((Number(tickNumber ?? 0n) % 120) / 30);

    // Aggregate total NPC demand by product across all cities
    const demands = await this.prisma.npcDemand.groupBy({
      by:     ['productId'],
      _sum:   { baseUnitsPerDay: true },
      _avg:   { referencePrice: true },
    });

    // SKU map for seasonal demand lookup
    const products = await this.prisma.product.findMany({ select: { id: true, sku: true } });
    const skuMap   = new Map(products.map(p => [p.id, p.sku]));

    let totalTraded = 0;

    for (const d of demands) {
      const baseDemand = d._sum.baseUnitsPerDay ?? 0;
      const sku        = skuMap.get(d.productId) ?? '';
      const seasonMult = MarketService.SEASONAL_NPC_DEMAND[sku]?.[season] ?? 1.0;
      const totalDemand = baseDemand * seasonMult;
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

  /**
   * Оновлює референтні ціни NPC на основі поточного балансу попиту/пропозиції.
   * Викликається ПІСЛЯ matchNpcMarketOrders щоб відображати реальну ринкову ситуацію.
   *
   * Логіка:
   *  - Надлишок пропозиції (supply > 1.5× demand) → ціна −1.5%
   *  - Дефіцит (supply < 0.4× demand) → ціна +2%
   *  - Інакше: випадковий дрейф ±0.5%
   *  - Обмеження: не більше ±4% за тік; абсолютний поріг ≥1 UAH
   */
  async updateNpcMarketPrices(): Promise<void> {
    const demands = await this.prisma.npcDemand.groupBy({
      by:   ['productId'],
      _sum: { baseUnitsPerDay: true },
      _avg: { referencePrice: true },
    });

    for (const d of demands) {
      const totalDemand = d._sum.baseUnitsPerDay ?? 0;
      const currentRef  = Number(d._avg.referencePrice ?? 0);
      if (totalDemand <= 0 || currentRef <= 0) continue;

      // Кількість пропозиції на ринку за поточною NPC ціною
      const supplyAgg = await this.prisma.marketOrder.aggregate({
        where: {
          productId:    d.productId,
          type:         'SELL',
          status:       { in: ['OPEN', 'PARTIALLY_FILLED'] },
          pricePerUnit: { lte: currentRef },
        },
        _sum: { quantityTotal: true },
      });
      const supply    = Number(supplyAgg._sum.quantityTotal ?? 0);
      const fillRatio = supply / totalDemand;

      let drift: number;
      if      (fillRatio > 1.5) drift = -0.015;                // надлишок → ціна падає
      else if (fillRatio > 0.8) drift = -0.003;                // помірне забезпечення
      else if (fillRatio < 0.2) drift = +0.025;                // гострий дефіцит
      else if (fillRatio < 0.4) drift = +0.012;                // недозабезпечення
      else                       drift = 0;                     // рівновага

      // Невеликий випадковий шум ±0.5%
      const noise     = (Math.random() - 0.5) * 0.01;
      const pctChange = Math.max(-0.04, Math.min(0.04, drift + noise));
      const newRef    = Math.max(1, currentRef * (1 + pctChange));

      if (Math.abs(newRef - currentRef) < 0.001) continue;

      await this.prisma.npcDemand.updateMany({
        where: { productId: d.productId },
        data:  { referencePrice: +newRef.toFixed(4) },
      });
    }
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

      // ── Динамічна ціна (еластичність) ──
      const fillRate  = order.quantityFilled / order.quantityTotal;
      const oldPrice  = Number(order.pricePerUnit);
      let   newPrice  = oldPrice;
      if      (fillRate > 0.70) newPrice = +(oldPrice * 1.07).toFixed(4);  // попит → ціна +7%
      else if (fillRate < 0.20) newPrice = +(oldPrice * 0.95).toFixed(4);  // залежує → ціна −5%

      // Обмежуємо: не нижче 60% і не вище 200% від referencePrice
      const ref = await this.prisma.npcDemand.findFirst({
        where: { productId: order.productId },
        select: { referencePrice: true },
      });
      if (ref?.referencePrice) {
        const refP = Number(ref.referencePrice);
        newPrice = Math.max(refP * 0.60, Math.min(refP * 2.00, newPrice));
      }

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

      // Новий ордер з оновленою ціною
      await this.prisma.marketOrder.create({
        data: {
          playerId:       player.id,
          productId:      order.productId,
          resourceType:   order.resourceType,
          type:           'SELL',
          status:         'OPEN',
          pricePerUnit:   newPrice,
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

    // Продукти для держзамовлень — тільки ті, що НЕ продає сам ДержПром
    // (щоб уникнути self-trading блоку)
    const TARGET_SKUS = [
      'FG-BREAD', 'FG-PASTA', 'SF-SUGAR', 'SF-STEEL',
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
      const ref = priceMap.get(product.id) ?? 0;
      if (ref === 0) continue; // пропускаємо продукти без ринкової ціни
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
