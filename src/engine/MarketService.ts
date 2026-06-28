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
      if (dp?.id) this._derzhpromId = dp.id; // cache only when found; retry next tick if not yet created
    }
    return this._derzhpromId ?? '';
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
    // Batch-fetch all open orders in 2 queries instead of 2×N per-product queries
    const [allSells, allBuysRaw] = await Promise.all([
      this.prisma.marketOrder.findMany({
        where:   { type: 'SELL', status: { in: ['OPEN', 'PARTIALLY_FILLED'] } },
        orderBy: [{ pricePerUnit: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.marketOrder.findMany({
        where:   { type: 'BUY',  status: { in: ['OPEN', 'PARTIALLY_FILLED'] } },
        orderBy: [{ pricePerUnit: 'desc' }, { createdAt: 'asc' }],
        select: {
          id: true, playerId: true, pricePerUnit: true, qualityMin: true,
          quantityTotal: true, quantityFilled: true, isStateOrder: true, productId: true,
        },
      }),
    ]);

    if (allSells.length === 0 || allBuysRaw.length === 0) return [];

    // Group by productId (in-memory)
    const sellsByProduct = new Map<string, typeof allSells>();
    const buysByProduct  = new Map<string, typeof allBuysRaw>();
    for (const s of allSells) {
      if (!sellsByProduct.has(s.productId)) sellsByProduct.set(s.productId, []);
      sellsByProduct.get(s.productId)!.push(s);
    }
    for (const b of allBuysRaw) {
      if (!buysByProduct.has(b.productId)) buysByProduct.set(b.productId, []);
      buysByProduct.get(b.productId)!.push(b);
    }

    // Only process products that have BOTH sells AND buys
    const productIds = [...sellsByProduct.keys()].filter(pid => buysByProduct.has(pid));
    if (productIds.length === 0) return [];

    const allTrades: TradeResult[] = [];
    const filledNotifs: { playerId: string; orderType: string; productId: string; qty: number; price: number; unit?: string; name?: string }[] = [];

    for (const productId of productIds) {
      const sells = sellsByProduct.get(productId)!;
      const buys  = buysByProduct.get(productId)!;

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
   * Глобальна обробка роздрібних NPC-продажів для всіх RETAIL_STORE.
   * Попит на кожен товар у місті розподіляється між конкуруючими магазинами
   * пропорційно до їхнього рейтингу: score = qualityFactor × priceCompetitiveness.
   * Магазини з вищою якістю та нижчою ціною отримують більшу частку попиту.
   */
  async processAllNpcSales(tickNumber: bigint): Promise<{ totalSold: number; totalRevenue: number }> {
    const season = Math.floor((Number(tickNumber) % 120) / 30);

    // ── Pre-fetch everything needed for computation ──────────────────────
    const [currencyShock, activeCampaigns, allShops, allDemands, allPlayers, exciseLicenses] = await Promise.all([
      this.prisma.macroEvent.findFirst({ where: { type: 'CURRENCY_SHOCK', status: 'ACTIVE' } }),
      this.prisma.syndicate.findMany({
        where:  { campaignEndsAtTick: { gte: tickNumber } },
        select: { members: { select: { playerId: true } } },
      }),
      this.prisma.enterprise.findMany({
        where:   { type: 'RETAIL_STORE', isOperational: true },
        include: {
          inventory:      true,
          retailListings: { where: { isActive: true } },
          landPlot:       { include: { city: true } },
        },
      }),
      this.prisma.npcDemand.findMany({
        include: { product: { select: { id: true, sku: true } } },
      }),
      this.prisma.player.findMany({ select: { id: true, cashBalance: true } }),
      this.prisma.license.findMany({
        where: { type: 'EXCISE_LICENSE', status: 'ACTIVE' },
        select: { enterpriseId: true },
      }),
    ]);

    if (allShops.length === 0) return { totalSold: 0, totalRevenue: 0 };

    const shockPriceMult  = currencyShock ? 1.20 : 1.0;
    const shockDemandMult = currencyShock ? 0.90 : 1.0;
    const campaignPlayerIds = new Set<string>(
      activeCampaigns.flatMap(s => s.members.map(m => m.playerId)),
    );
    const playerMap      = new Map(allPlayers.map(p => [p.id, new Decimal(p.cashBalance.toString())]));
    const exciseShopIds  = new Set(exciseLicenses.map(l => l.enterpriseId));

    // Group shops and demands by city
    const shopsByCity = new Map<string, typeof allShops>();
    for (const shop of allShops) {
      const cid = shop.landPlot.cityId;
      if (!shopsByCity.has(cid)) shopsByCity.set(cid, []);
      shopsByCity.get(cid)!.push(shop);
    }
    const demandsByCity = new Map<string, typeof allDemands>();
    for (const d of allDemands) {
      if (!demandsByCity.has(d.cityId)) demandsByCity.set(d.cityId, []);
      demandsByCity.get(d.cityId)!.push(d);
    }

    // ── Compute all sales in-memory ──────────────────────────────────────
    const EXCISE_RATE: Record<string, number> = { 'FG-BEER': 12, 'FG-SPIRITS': 95 };

    // Accumulators for batch writes
    const invDecrements    = new Map<string, number>();               // inventoryId → qty
    const playerRevenue    = new Map<string, Decimal>();              // playerId → net revenue
    const finTxns: Array<Parameters<typeof this.prisma.financialTransaction.create>[0]['data']> = [];
    const finLogs: Array<Parameters<typeof this.prisma.financialLog.create>[0]['data']>         = [];

    let totalSold    = 0;
    let totalRevenue = 0;

    for (const [cityId, shops] of shopsByCity) {
      const city    = shops[0].landPlot.city;
      const demands = demandsByCity.get(cityId) ?? [];

      for (const demand of demands) {
        const sku          = demand.product.sku;
        const refPrice     = Number(demand.referencePrice) * shockPriceMult;
        const seasonMult   = MarketService.SEASONAL_NPC_DEMAND[sku]?.[season] ?? 1.0;
        const totalDemand  = demand.baseUnitsPerDay * Number(city.demandCoefficient) * seasonMult * shockDemandMult;

        const competitors = shops
          .map(shop => {
            const inv     = shop.inventory.find(i => i.productId === demand.productId && Number(i.quantity) > 0.001);
            const listing = shop.retailListings.find(l => l.productId === demand.productId && l.isActive);
            if (!inv) return null;
            const basePrice    = listing ? Number(listing.pricePerUnit) : refPrice;
            const promoActive  = listing?.promotionActive ?? false;
            const price        = promoActive ? basePrice * 0.85 : basePrice;
            const qFactor      = Number(demand.qualityWeight) * (inv.avgQuality / 10) + (1 - Number(demand.qualityWeight));
            const pFactor      = refPrice > 0 ? Math.pow(refPrice / Math.max(price, 0.01), Math.abs(Number(demand.priceElasticity))) : 1;
            const promoBoost   = promoActive ? 1.5 : 1.0;
            const campaignBoost = campaignPlayerIds.has(shop.playerId) ? 1.20 : 1.0;
            return { shop, inv, price, score: qFactor * pFactor * promoBoost * campaignBoost };
          })
          .filter((c): c is NonNullable<typeof c> => c !== null);

        if (competitors.length === 0) continue;

        const totalScore = competitors.reduce((s, c) => s + c.score, 0);

        for (const { shop, inv, price, score } of competitors) {
          const marketShare = totalScore > 0 ? score / totalScore : 1 / competitors.length;
          const actualSold  = Math.min(totalDemand * marketShare, Number(inv.quantity));
          if (actualSold < 0.001) continue;

          const revenue   = new Decimal(price).times(actualSold);
          const shareNote = competitors.length > 1 ? ` (ринок ${(marketShare * 100).toFixed(0)}%)` : '';

          // Accumulate in-memory
          invDecrements.set(inv.id, (invDecrements.get(inv.id) ?? 0) + actualSold);
          const cur = playerRevenue.get(shop.playerId) ?? new Decimal(0);
          playerRevenue.set(shop.playerId, cur.plus(revenue));

          const balanceBefore = playerMap.get(shop.playerId) ?? new Decimal(0);
          const balanceAfter  = balanceBefore.plus(revenue);
          playerMap.set(shop.playerId, balanceAfter);

          finTxns.push({
            playerId: shop.playerId, type: 'NPC_SALE', amountUah: revenue,
            balanceBefore, balanceAfter,
            description: `NPC роздріб: ${actualSold.toFixed(2)} × ${sku} у ${city.nameUa}`,
            referenceId: demand.id,
          });
          finLogs.push({
            playerId: shop.playerId, category: 'REVENUE_RETAIL', amountUah: revenue,
            description: `Роздрібний продаж у "${shop.name}": ${actualSold.toFixed(1)} од.${shareNote}`,
            referenceId: shop.id, tickNumber,
          });

          // Excise tax
          const excisePerUnit = EXCISE_RATE[sku];
          if (excisePerUnit && exciseShopIds.has(shop.id)) {
            const excise = new Decimal(excisePerUnit).times(actualSold);
            playerRevenue.set(shop.playerId, (playerRevenue.get(shop.playerId) ?? new Decimal(0)).minus(excise));
            finLogs.push({
              playerId: shop.playerId, category: 'EXPENSE_TAX', amountUah: excise.negated(),
              description: `Акциз ${sku}: ${actualSold.toFixed(1)} × ₴${excisePerUnit}`, tickNumber,
            });
          }

          inv.quantity = (Number(inv.quantity) - actualSold) as any;
          totalSold    += actualSold;
          totalRevenue += revenue.toNumber();
        }
      }
    }

    if (invDecrements.size === 0) return { totalSold, totalRevenue };

    // ── Single batch write ────────────────────────────────────────────────
    await this.prisma.$transaction([
      ...Array.from(invDecrements.entries()).map(([id, qty]) =>
        this.prisma.enterpriseInventory.update({ where: { id }, data: { quantity: { decrement: qty } } }),
      ),
      ...Array.from(playerRevenue.entries()).map(([id, net]) =>
        this.prisma.player.update({ where: { id }, data: { cashBalance: { increment: net } } }),
      ),
      this.prisma.financialTransaction.createMany({ data: finTxns as any[] }),
      this.prisma.financialLog.createMany({ data: finLogs as any[] }),
    ]);

    return { totalSold, totalRevenue };
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
    'SF-CORN-STARCH':       [1.0, 1.1, 1.0, 0.9],
    'FG-CAKE':              [1.0, 0.9, 1.1, 1.4],  // зимою та восени — кондитерські вироби
    'FG-CORN-SYRUP':        [1.0, 1.2, 1.0, 0.9],
    'FG-CONDENSED-MILK':    [0.9, 0.8, 1.0, 1.3],  // зимою — традиційний
    'FG-MEAT':              [1.0, 1.1, 1.2, 1.3],  // осінньо-зимовий пік (шашлики + свята)
    'FG-CHEESE':            [1.0, 0.9, 1.1, 1.4],  // зима — новорічні столи
    'FG-BUTTER':            [0.9, 0.9, 1.1, 1.3],  // зима — традиційна випічка
    'FG-SAUSAGE':           [1.0, 1.1, 1.2, 1.3],  // осінь/зима — пікніки та свята
    'FG-CLOTHING':          [0.7, 0.8, 1.2, 1.8],  // зимовий пік — пальта, куртки
    'FG-KNITWEAR':          [0.6, 0.7, 1.3, 1.9],  // зимовий пік — светри, шарфи
    'FG-BEER':              [0.8, 2.0, 1.0, 0.7],  // літній пік — спека, відпочинок
    'FG-SPIRITS':           [0.9, 0.7, 1.0, 1.5],  // зимовий пік — свята
    // Зернові: низький попит влітку/восени (жнива = надлишок), пік взимку/навесні
    'RM-WHEAT':             [1.20, 0.65, 0.70, 1.45],
    'RM-CORN':              [1.15, 0.60, 0.65, 1.40],
    'RM-WHEAT-ORG':         [1.20, 0.65, 0.70, 1.45],
    'RM-CORN-ORG':          [1.15, 0.60, 0.65, 1.40],
    // Тваринництво: м'ясний пік — осінь/зима (свята + холод)
    'FG-BEEF':              [1.0, 0.9, 1.2, 1.4],
    'FG-PORK':              [1.0, 0.9, 1.3, 1.5],
    'FG-CHICKEN':           [1.0, 1.0, 1.1, 1.2],
    'FG-EGGS':              [1.1, 0.8, 1.0, 1.3],  // Великдень (весна) та Новий рік
  };

  async matchNpcMarketOrders(tickNumber?: bigint): Promise<number> {
    const season = Math.floor((Number(tickNumber ?? 0n) % 120) / 30);
    const derzhpromId = await this.getDerzhpromId();

    const GRAIN_SKUS   = new Set(['RM-WHEAT', 'RM-SUNFL', 'RM-SUGBEET', 'RM-CORN']);
    const ORGANIC_SKUS = new Set(['RM-WHEAT-ORG', 'RM-CORN-ORG']);

    // ── Pre-fetch everything in parallel ─────────────────────────────────
    const [currencyShock, demands, products, organicCertIds, allPlayerSells, allPlayers] = await Promise.all([
      this.prisma.macroEvent.findFirst({ where: { type: 'CURRENCY_SHOCK', status: 'ACTIVE' } }),
      this.prisma.npcDemand.groupBy({ by: ['productId'], _sum: { baseUnitsPerDay: true }, _avg: { referencePrice: true } }),
      this.prisma.product.findMany({ select: { id: true, sku: true } }),
      this.getOrganicCertPlayers(),
      // Exclude NPC SELL orders — NPC should not buy from itself
      this.prisma.marketOrder.findMany({
        where: {
          type:   'SELL',
          status: { in: ['OPEN', 'PARTIALLY_FILLED'] },
          player: { isNpcSeller: false },  // only real player sell orders
        },
        orderBy: [{ pricePerUnit: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, playerId: true, productId: true, quantityTotal: true, quantityFilled: true, pricePerUnit: true, quality: true, createdAt: true },
      }),
      this.prisma.player.findMany({ where: { isNpcSeller: false }, select: { id: true, cashBalance: true } }),
    ]);

    if (allPlayerSells.length === 0) return 0;

    const shockPriceMult  = currencyShock ? 1.20 : 1.0;
    const shockDemandMult = currencyShock ? 0.90 : 1.0;
    const skuMap          = new Map(products.map(p => [p.id, p.sku]));
    const playerMap       = new Map(allPlayers.map(p => [p.id, new Decimal(p.cashBalance.toString())]));

    // Group player SELL orders by productId
    const sellsByProduct = new Map<string, typeof allPlayerSells>();
    for (const s of allPlayerSells) {
      if (!sellsByProduct.has(s.productId)) sellsByProduct.set(s.productId, []);
      sellsByProduct.get(s.productId)!.push(s);
    }

    let totalTraded = 0;

    // Accumulators for batch writes
    type OrderUpdate = { id: string; quantityFilled: number; status: string; isFilled: boolean };
    type InvUpdate   = { playerId: string; productId: string; qty: number };
    const orderUpdates: OrderUpdate[] = [];
    const invUpdates:   InvUpdate[]   = [];
    const finTxns: any[] = [];
    const notifications: { playerId: string; body: string; price: number }[] = [];

    for (const d of demands) {
      const sells = sellsByProduct.get(d.productId);
      if (!sells || sells.length === 0) continue;

      const sku          = skuMap.get(d.productId) ?? '';
      const seasonMult   = MarketService.SEASONAL_NPC_DEMAND[sku]?.[season] ?? 1.0;
      const totalDemand  = (d._sum.baseUnitsPerDay ?? 0) * seasonMult * shockDemandMult;
      const refPrice     = new Decimal(String(d._avg.referencePrice ?? 0)).times(shockPriceMult);
      if (totalDemand <= 0 || refPrice.lte(0)) continue;

      const isGrain      = GRAIN_SKUS.has(sku);
      const isOrganic    = ORGANIC_SKUS.has(sku);
      const maxPrice     = isOrganic ? refPrice.times(1.8) : isGrain ? refPrice.times(1.3) : refPrice;
      const fetchCeiling = isGrain ? maxPrice.times(1.35) : maxPrice;

      let remaining = totalDemand;

      for (const sell of sells) {
        if (remaining <= 0.001) break;

        const sellPrice = new Decimal(sell.pricePerUnit.toString());
        if (sellPrice.gt(fetchCeiling)) continue;

        const hasOrganicCert   = organicCertIds.has(sell.playerId);
        const effectiveCeiling = hasOrganicCert ? maxPrice.times(1.35) : maxPrice;
        if (sellPrice.gt(effectiveCeiling)) continue;

        if (isGrain) {
          const q = sell.quality ?? 5.0;
          const qualityMax     = hasOrganicCert ? refPrice.times(1.35) : refPrice.times(1.3);
          const qualityCeiling = q >= 8.0 ? qualityMax : q < 5.0 ? refPrice.times(0.8) : refPrice;
          if (sellPrice.gt(qualityCeiling)) continue;
        }

        const available  = sell.quantityTotal - sell.quantityFilled;
        const tradeQty   = Math.min(available, remaining);
        if (tradeQty <= 0.001) continue;

        const tradeValue = sellPrice.times(tradeQty);
        const newFilled  = sell.quantityFilled + tradeQty;
        const isFilled   = newFilled >= sell.quantityTotal - 0.001;

        // Update in-memory balance
        const curBal = playerMap.get(sell.playerId) ?? new Decimal(0);
        const newBal = curBal.plus(tradeValue);
        playerMap.set(sell.playerId, newBal);

        orderUpdates.push({ id: sell.id, quantityFilled: newFilled, status: isFilled ? 'FILLED' : 'PARTIALLY_FILLED', isFilled });
        invUpdates.push({ playerId: sell.playerId, productId: d.productId, qty: tradeQty });
        (finTxns as any[]).push({
          playerId: sell.playerId, type: 'NPC_SALE', amountUah: tradeValue,
          balanceBefore: curBal, balanceAfter: newBal,
          description: `NPC купівля: ${tradeQty.toFixed(1)} × ${sku} @ ₴${sellPrice.toFixed(0)}/od.`,
          referenceId: sell.id,
        });
        if (isFilled) notifications.push({ playerId: sell.playerId, body: `NPC викупив ${tradeQty.toFixed(0)} od. @ ₴${sellPrice.toFixed(0)}/od.`, price: sellPrice.toNumber() });

        sell.quantityFilled = newFilled; // update in-memory for subsequent passes
        remaining   -= tradeQty;
        totalTraded += tradeQty;
      }
    }

    if (orderUpdates.length === 0) return 0;

    const now = new Date();
    await this.prisma.$transaction([
      ...orderUpdates.map(o => this.prisma.marketOrder.update({
        where: { id: o.id },
        data: { quantityFilled: o.quantityFilled, status: o.status as any, filledAt: o.isFilled ? now : null },
      })),
      ...invUpdates.map(u => this.prisma.playerInventory.updateMany({
        where: { playerId: u.playerId, productId: u.productId },
        data:  { quantity: { decrement: u.qty } },
      })),
      ...Array.from(playerMap.entries())
        .filter(([id]) => allPlayers.some(p => p.id === id))
        .map(([id, bal]) => this.prisma.player.update({ where: { id }, data: { cashBalance: bal } })),
      this.prisma.financialTransaction.createMany({ data: finTxns as any[] }),
      ...notifications.map(n => this.prisma.notification.create({
        data: { playerId: n.playerId, type: 'ORDER_FILLED', title: 'Ордер виконано', body: n.body, entityId: null },
      })),
    ]);

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
    // Batch fetch: demands + all SELL order supply grouped by product (excluding ДержПром)
    const derzhpromId = await this.getDerzhpromId();
    const [demands, supplyGroups] = await Promise.all([
      this.prisma.npcDemand.groupBy({ by: ['productId'], _sum: { baseUnitsPerDay: true }, _avg: { referencePrice: true } }),
      this.prisma.marketOrder.groupBy({
        by:    ['productId'],
        _sum:  { quantityTotal: true },
        where: { type: 'SELL', status: { in: ['OPEN', 'PARTIALLY_FILLED'] }, NOT: { playerId: derzhpromId } },
      }),
    ]);

    const supplyMap = new Map(supplyGroups.map(s => [s.productId, Number(s._sum.quantityTotal ?? 0)]));

    const updates: { productId: string; newRef: number }[] = [];
    for (const d of demands) {
      const totalDemand = d._sum.baseUnitsPerDay ?? 0;
      const currentRef  = Number(d._avg.referencePrice ?? 0);
      if (totalDemand <= 0 || currentRef <= 0) continue;

      // Supply: player SELL orders at or below refPrice (approximated by total supply)
      const supply    = supplyMap.get(d.productId) ?? 0;
      const fillRatio = supply / totalDemand;

      let drift: number;
      if      (fillRatio > 1.5) drift = -0.015;
      else if (fillRatio > 0.8) drift = -0.003;
      else if (fillRatio < 0.2) drift = +0.025;
      else if (fillRatio < 0.4) drift = +0.012;
      else                       drift = 0;

      const noise     = (Math.random() - 0.5) * 0.01;
      const pctChange = Math.max(-0.04, Math.min(0.04, drift + noise));
      const newRef    = Math.max(1, currentRef * (1 + pctChange));

      if (Math.abs(newRef - currentRef) >= 0.001) {
        updates.push({ productId: d.productId, newRef });
      }
    }

    if (updates.length > 0) {
      await this.prisma.$transaction(
        updates.map(u => this.prisma.npcDemand.updateMany({
          where: { productId: u.productId },
          data:  { referencePrice: +u.newRef.toFixed(4) },
        })),
      );
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

  /**
   * Генерує SELL-ордери від ДержПром для сировини та напівфабрикатів.
   * Ціна = referencePrice × 1.05 (+5% markup), обсяг 300–1500 од.
   * Викликається кожні 8 тіків разом із generateStateOrders().
   */
  async generateNpcSellOrders(): Promise<number> {
    const derzhprom = await this.prisma.player.upsert({
      where:  { username: 'derzhprom' },
      create: {
        email:        'derzhprom@state.gov.ua',
        username:     'derzhprom',
        passwordHash: 'npc-no-login',
        companyName:  'ДержПром',
        isNpcSeller:  true,
        cashBalance:  100_000_000,
      },
      update: {},
      select: { id: true },
    });

    // Базові ціни (UAH/кг або UAH/од) для сировини та напівфабрикатів
    const FALLBACK_PRICES: Record<string, number> = {
      // Зернові / польові культури
      'RM-WHEAT':        3.8,
      'RM-CORN':         3.2,
      'RM-SUNFL':        6.5,
      'RM-SUGBEET':      1.4,
      'RM-BARLEY':       3.0,
      // Тваринництво-сировина
      'RM-MILK':         8.5,
      // Метали / важка промисловість
      'RM-IRONORE':      4.2,
      'RM-COAL':         3.6,
      // Деревина
      'RM-LUMBER':      12.0,
      // Текстиль
      'RM-COTTON':      28.0,
      'RM-WOOL':        45.0,
      // Напівфабрикати харчові
      'SF-FLOUR':        8.5,
      'SF-SUGAR':       15.0,
      'SF-CORN-STARCH': 11.0,
      'SF-MALT':        18.0,
      // Напівфабрикати промислові
      'SF-STEEL':       42.0,
      'SF-PLANKS':      15.0,
      'SF-FABRIC':      65.0,
      'SF-YARN':        55.0,
      // Тваринництво (жива худоба — ціна за голову)
      'RM-LIVESTOCK':      250,
      'RM-CATTLE':      45_000,
      'RM-PIGS':        12_000,
      'RM-POULTRY':       120,
      // Молочне
      'SF-MILK':           8.5,
      // Органічні культури (ціна за тонну)
      'RM-WHEAT-ORG':  9_500,
      'RM-CORN-ORG':   7_200,
      // Компост
      'SF-COMPOST':        3.0,
      // Готові товари (FG) — ціна з NpcDemand, тут fallback
      'FG-BREAD':         32,
      'FG-SUNOIL':        75,
      'FG-MILK':          28,
      'FG-PASTA':         52,
      'FG-STEEL-P':      185,
      'FG-FURN':        8_500,
      'FG-MEAT':         175,
      'FG-CAKE':         145,
      'FG-CORN-SYRUP':    95,
      'FG-CONDENSED-MILK':88,
      'FG-CHEESE':       185,
      'FG-BUTTER':       220,
      'FG-SAUSAGE':      210,
      'FG-HONEY':        380,
      'FG-BEER':          55,
      'FG-SPIRITS':      220,
      'FG-CLOTHING':     850,
      'FG-KNITWEAR':     680,
      'FG-BEEF':         290,
      'FG-PORK':         195,
      'FG-CHICKEN':      125,
      'FG-EGGS':          58,
      // Агро витратники
      'AG-FERTILIZER':   9.0,
      'RM-PESTICIDE':    4.5,
      // Будівельні матеріали (ціна за одиницю: тонна або шт)
      'CM-CEMENT':    3_800,
      'CM-SAND':        450,
      'CM-GRAVEL':      800,
      'CM-BRICK':         9,
      'CM-CONCRETE':  4_500,
      'CM-REBAR':    42_000,
      'CM-TIMBER':   12_000,
    };
    const NPC_SELL_SKUS = Object.keys(FALLBACK_PRICES);

    // Скасувати старі NPC sell-ордери
    await this.prisma.marketOrder.updateMany({
      where: {
        playerId:      derzhprom.id,
        type:          'SELL',
        isStateOrder:  false,
        status:        { in: ['OPEN', 'PARTIALLY_FILLED'] },
      },
      data: { status: 'CANCELLED' },
    });

    const products = await this.prisma.product.findMany({
      where:  { sku: { in: NPC_SELL_SKUS } },
      select: { id: true, sku: true },
    });

    const npcPrices = await this.prisma.npcDemand.groupBy({
      by: ['productId'],
      where: { productId: { in: products.map(p => p.id) } },
      _avg: { referencePrice: true },
    });
    const priceMap = new Map(npcPrices.map(n => [n.productId, Number(n._avg.referencePrice ?? 0)]));

    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);

    // Будуємо дані для batch-операцій
    const toCreate: { productId: string; sku: string; price: number; qty: number }[] = [];
    for (const product of products) {
      const ref = priceMap.get(product.id) ?? FALLBACK_PRICES[product.sku] ?? 0;
      if (ref === 0) continue;
      toCreate.push({ productId: product.id, sku: product.sku, price: +(ref * 1.05).toFixed(2), qty: Math.round(300 + Math.random() * 1200) });
    }
    if (toCreate.length === 0) return 0;

    // Поповнити інвентар ДержПром одним batch-запитом (upsert у паралелі)
    await Promise.all(toCreate.map(p =>
      this.prisma.playerInventory.upsert({
        where:  { playerId_productId: { playerId: derzhprom.id, productId: p.productId } },
        update: { quantity: { increment: p.qty } },
        create: { playerId: derzhprom.id, productId: p.productId, quantity: p.qty, avgQuality: 6 },
      })
    ));

    // Один createMany для всіх ордерів
    await this.prisma.marketOrder.createMany({
      data: toCreate.map(p => ({
        playerId:       derzhprom.id,
        productId:      p.productId,
        resourceType:   p.sku,
        type:           'SELL' as const,
        status:         'OPEN' as const,
        pricePerUnit:   p.price,
        quality:        6.0,
        quantityTotal:  p.qty,
        quantityFilled: 0,
        isStateOrder:   false,
        expiresAt,
      })),
    });

    return toCreate.length;
  }

  /** Перевіряє цінові сповіщення та надсилає нотифікації гравцям. */
  async processPriceAlerts(): Promise<void> {
    const alerts = await this.prisma.priceAlert.findMany({
      where: { isActive: true },
      select: { id: true, playerId: true, productSku: true, alertBelow: true, alertAbove: true },
    });
    if (alerts.length === 0) return;

    const skus = [...new Set(alerts.map(a => a.productSku))];
    const products = await this.prisma.product.findMany({
      where: { sku: { in: skus } },
      select: { id: true, sku: true, nameUa: true },
    });
    const priceRows = await this.prisma.npcDemand.groupBy({
      by: ['productId'],
      where: { productId: { in: products.map(p => p.id) } },
      _avg: { referencePrice: true },
    });
    const priceMap = new Map(products.map(p => {
      const row = priceRows.find(r => r.productId === p.id);
      return [p.sku, { price: Number(row?._avg.referencePrice ?? 0), nameUa: p.nameUa }];
    }));

    for (const alert of alerts) {
      const info  = priceMap.get(alert.productSku);
      if (!info || info.price === 0) continue;
      const below = alert.alertBelow ? Number(alert.alertBelow) : null;
      const above = alert.alertAbove ? Number(alert.alertAbove) : null;
      const fired = (below !== null && info.price <= below) || (above !== null && info.price >= above);
      if (!fired) continue;

      const dir  = below !== null && info.price <= below ? `впала до ${info.price.toFixed(2)} ₴ (ціль ≤ ${below})` : `зросла до ${info.price.toFixed(2)} ₴ (ціль ≥ ${above})`;
      await this.prisma.notification.create({
        data: {
          playerId: alert.playerId,
          type:     'INFO',
          title:    `Цінове сповіщення: ${info.nameUa}`,
          body:     `Ціна ${dir}`,
        },
      }).catch(() => {});

      await this.prisma.priceAlert.update({
        where: { id: alert.id },
        data:  { isActive: false, firedAt: new Date() },
      });
    }
  }

  // Returns playerIds who have active ORGANIC_CERT license AND at least one AGRO_FARM with soilQuality ≥ 8
  private async getOrganicCertPlayers(): Promise<Set<string>> {
    const licensed = await this.prisma.license.findMany({
      where: { type: 'ORGANIC_CERT', status: 'ACTIVE' },
      select: { enterprise: { select: { playerId: true, landPlot: { select: { soilQuality: true } } } } },
    });
    const ids = new Set<string>();
    for (const lic of licensed) {
      if (lic.enterprise && (lic.enterprise.landPlot?.soilQuality ?? 0) >= 8) {
        ids.add(lic.enterprise.playerId);
      }
    }
    return ids;
  }
}
