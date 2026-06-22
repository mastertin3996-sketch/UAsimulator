/**
 * StockExchangeService — фондова біржа UAeconomy.
 *
 * ── IPO (launchInitialPublicOffering) ─────────────────────────────────────────
 *
 *   Суворі вимоги до виходу на біржу:
 *     • companyValuationUah ≥ ₴10 000 000 (Step 18)
 *     • ComplianceScore ≥ 0.85 (Step 10)
 *     • Жодне підприємство не заморожено судом (Step 17)
 *     • Гравець не банкрут і не має активного тікера
 *
 *   Розподіл акцій при IPO:
 *     • 60% → ShareholderRegistry засновника
 *     • 40% → StockOrderBook (SELL-ордер від treasury, placedByPlayerId = null)
 *       Виручка від продажу float надходить засновнику через IPO_PROCEEDS.
 *
 * ── Order Matching (matchStockOrders) ────────────────────────────────────────
 *
 *   Класичний price-time priority у Serializable-транзакції:
 *     BUY-ордери: ціна DESC, createdAtTick ASC (найкраща ціна + найстаріший)
 *     SELL-ордери: ціна ASC, createdAtTick ASC
 *
 *   Виконання при buyPrice ≥ sellPrice:
 *     executionPrice = sell.pricePerShareUah  (maker = продавець)
 *     totalCost = execQty × executionPrice
 *
 *   Три джерела продавця:
 *     1. Реальний гравець (placedByPlayerId ≠ null):
 *        UAH → продавець, акції з ShareholderRegistry продавця
 *     2. Treasury/float (placedByPlayerId = null):
 *        UAH → засновник (IPO_PROCEEDS), акції зі StockTicker.freeFloatShares
 *
 *   Після кожного матчу: lastTradedPriceUah + marketCapUah оновлюються.
 *
 * ── Dividends (distributeDividends) ──────────────────────────────────────────
 *
 *   DPS = totalPoolUah / totalSharesIssued
 *
 *   Serializable-транзакція:
 *     1. Списати totalPoolUah з балансу засновника
 *     2. Для кожного запису ShareholderRegistry: payout = DPS × sharesCount
 *        → кредит на cashBalance акціонера + REVENUE_INTEREST транзакція
 *     3. Останній акціонер отримує залишок (захист від заокруглення)
 *
 * ── Market Tick (processStockMarketTick) ─────────────────────────────────────
 *
 *   Для кожного активного тікера:
 *     a. targetValuationUah ← Player.companyValuationUah (фундаментальна оцінка)
 *     b. impliedPriceUah = targetValuationUah / totalSharesIssued
 *     c. NPC-корекція (синтетичний тиск, без реального переміщення коштів):
 *          якщо ринок < фундаментал × 0.85 → nudge up 2%/тік
 *          якщо ринок > фундаментал × 1.20 → nudge down 2%/тік
 *     d. marketCapUah = totalSharesIssued × lastTradedPriceUah
 *     e. matchStockOrders (виконати наявні ордери)
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

// ── IPO константи ─────────────────────────────────────────────────────────────
const MIN_VALUATION_FOR_IPO_UAH = new Decimal('10000000');  // ₴10М
const MIN_COMPLIANCE_FOR_IPO    = 0.85;
const FOUNDER_FLOAT_PCT         = 0.60;   // 60% засновнику
const PUBLIC_FLOAT_PCT          = 0.40;   // 40% у вільний обіг
const MIN_SHARES_TO_ISSUE       = 100_000;
const MAX_SYMBOL_LEN            = 8;

// ── NPC-корекція ──────────────────────────────────────────────────────────────
const NPC_UNDERVALUED_THRESHOLD = 0.85;   // ринок < фундаментал × 0.85 → undervalued
const NPC_OVERVALUED_THRESHOLD  = 1.20;   // ринок > фундаментал × 1.20 → overvalued
const NPC_NUDGE_RATE            = 0.02;   // 2% наближення до fair value за тік

// ── Типи результатів ──────────────────────────────────────────────────────────

export interface IPOResult {
  tickerId:         string;
  symbol:           string;
  totalSharesIssued: bigint;
  founderShares:    bigint;
  floatShares:      bigint;
  initialPriceUah:  Decimal;
  initialMarketCap: Decimal;
}

export interface MatchResult {
  tickerId:       string;
  tradesExecuted: number;
  sharesTraded:   bigint;
  volumeUah:      Decimal;
  lastPriceUah:   Decimal | null;
}

export interface DividendResult {
  tickerId:             string;
  symbol:               string;
  totalPoolUah:         Decimal;
  dividendPerShare:     Decimal;
  shareholdersRewarded: number;
  totalPaidUah:         Decimal;
}

export interface StockMarketTickSummary {
  tick:                bigint;
  tickersProcessed:    number;
  totalTradesExecuted: number;
  totalVolumeUah:      Decimal;
  npcCorrections:      number;
}

// ═════════════════════════════════════════════════════════════════════════════

export class StockExchangeService {
  constructor(private readonly db: PrismaClient) {}

  // ══════════════════════════════════════════════════════════════════════════
  // IPO — ПЕРВИННЕ ПУБЛІЧНЕ РОЗМІЩЕННЯ
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Виводить компанію на публічну фондову біржу.
   *
   * Передумови (всі перевіряються до транзакції):
   *   1. companyValuationUah ≥ ₴10M (Step 18)
   *   2. ComplianceScore ≥ 0.85 (Step 10)
   *   3. Жодне підприємство не в судовому заморожуванні (Step 17)
   *   4. Гравець не банкрут і ще не має тікера
   *
   * Після IPO:
   *   • 60% акцій → ShareholderRegistry засновника
   *   • 40% акцій → StockOrderBook SELL (treasury, placedByPlayerId = null)
   *   • Виручка від продажу float надходить засновнику при матчингу
   */
  async launchInitialPublicOffering(
    playerId:         string,
    symbol:           string,
    sharesToIssue:    number,
    initialPriceUah:  number,
    currentTick:      bigint,
  ): Promise<IPOResult> {
    // ── Вхідна валідація ─────────────────────────────────────────────────
    const sym = symbol.toUpperCase().trim();
    if (!sym || sym.length > MAX_SYMBOL_LEN || !/^[A-Z0-9_]+$/.test(sym)) {
      throw new Error(
        `Некоректний символ тікера "${symbol}". ` +
        `Допускаються тільки латинські літери, цифри та "_" (макс. ${MAX_SYMBOL_LEN} симв.).`,
      );
    }
    if (!Number.isInteger(sharesToIssue) || sharesToIssue < MIN_SHARES_TO_ISSUE) {
      throw new Error(`Мінімальна кількість акцій для IPO — ${MIN_SHARES_TO_ISSUE.toLocaleString()}.`);
    }
    if (initialPriceUah <= 0) {
      throw new Error('Початкова ціна акції повинна бути більшою за 0.');
    }

    // ── Перевірки умов IPO ───────────────────────────────────────────────
    const [player, compliance, frozenEnts, existingTicker, symbolTaken] = await Promise.all([
      this.db.player.findUniqueOrThrow({
        where:  { id: playerId },
        select: { isBankrupt: true, companyValuationUah: true, companyName: true },
      }),
      this.db.complianceRecord.findUnique({
        where:  { playerId },
        select: { score: true },
      }),
      this.db.enterprise.findFirst({
        where:  { playerId, isLegallyFrozen: true },
        select: { id: true, name: true },
      }),
      this.db.stockTicker.findUnique({
        where:  { playerId },
        select: { id: true },
      }),
      this.db.stockTicker.findUnique({
        where:  { symbol: sym },
        select: { id: true },
      }),
    ]);

    if (player.isBankrupt) {
      throw new Error('Банкрут не може виходити на IPO.');
    }
    if (existingTicker) {
      throw new Error('Компанія вже має активний тікер на біржі. Повторний IPO неможливий.');
    }
    if (symbolTaken) {
      throw new Error(`Символ "${sym}" вже зайнятий іншою компанією.`);
    }

    const valuation = new Decimal(player.companyValuationUah.toString());
    if (valuation.lessThan(MIN_VALUATION_FOR_IPO_UAH)) {
      throw new Error(
        `Оцінка компанії ₴${valuation.toFixed(0)} недостатня для IPO. ` +
        `Мінімум: ₴${MIN_VALUATION_FOR_IPO_UAH.toFixed(0)}.`,
      );
    }

    const complianceScore = compliance?.score ?? 0;
    if (complianceScore < MIN_COMPLIANCE_FOR_IPO) {
      throw new Error(
        `ComplianceScore ${complianceScore.toFixed(2)} нижчий за мінімум ${MIN_COMPLIANCE_FOR_IPO} для IPO.`,
      );
    }

    if (frozenEnts) {
      throw new Error(
        `Підприємство «${frozenEnts.name}» заморожено судовим арештом. ` +
        'Зніміть арешт перед виходом на біржу.',
      );
    }

    // ── Виконання IPO у ReadCommitted-транзакції ─────────────────────────
    const totalShares   = BigInt(sharesToIssue);
    const founderShares = BigInt(Math.floor(sharesToIssue * FOUNDER_FLOAT_PCT));
    const floatShares   = totalShares - founderShares;
    const initPrice     = new Decimal(initialPriceUah.toFixed(4));
    const marketCap     = initPrice.times(totalShares.toString());

    const ticker = await this.db.$transaction(async tx => {
      const t = await tx.stockTicker.create({
        data: {
          playerId:          playerId,
          symbol:            sym,
          totalSharesIssued: totalShares,
          freeFloatShares:   floatShares,
          lastTradedPriceUah: initPrice,
          targetValuationUah: valuation,
          marketCapUah:       marketCap,
          ipoExecutedAtTick:  currentTick,
        },
      });

      // 60% → засновник
      await tx.shareholderRegistry.create({
        data: { playerId, tickerId: t.id, sharesCount: founderShares },
      });

      // 40% → treasury SELL-ордер (placedByPlayerId = null)
      await tx.stockOrderBook.create({
        data: {
          tickerId:         t.id,
          type:             'SELL',
          placedByPlayerId: null,    // treasury ордер; виручка → засновник при матчу
          pricePerShareUah: initPrice,
          quantity:         floatShares,
          status:           'OPEN',
          createdAtTick:    currentTick,
        },
      });

      return t;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

    return {
      tickerId:          ticker.id,
      symbol:            sym,
      totalSharesIssued: totalShares,
      founderShares,
      floatShares,
      initialPriceUah:   initPrice,
      initialMarketCap:  marketCap,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // РОЗМІЩЕННЯ / СКАСУВАННЯ ОРДЕРІВ (публічний API)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Розміщує BUY або SELL лімітний ордер від імені гравця.
   *
   * SELL: перевіряємо наявність акцій у ShareholderRegistry.
   * BUY:  перевіряємо, що cashBalance ≥ qty × price (м'яка перевірка;
   *        жорстка re-validate відбувається при матчингу).
   */
  async placeStockOrder(
    playerId:        string,
    tickerId:        string,
    type:            'BUY' | 'SELL',
    quantity:        number,
    pricePerShareUah: number,
    currentTick:     bigint,
  ): Promise<{ orderId: string }> {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new Error('Кількість акцій повинна бути цілим додатним числом.');
    }
    if (pricePerShareUah <= 0) {
      throw new Error('Ціна ордера повинна бути більшою за 0.');
    }

    const qty   = BigInt(quantity);
    const price = new Decimal(pricePerShareUah.toFixed(4));

    await this.db.stockTicker.findUniqueOrThrow({
      where:  { id: tickerId },
      select: { id: true, isActive: true },
    }).then(t => {
      if (!t.isActive) throw new Error('Тікер неактивний — торгівля заборонена.');
    });

    if (type === 'SELL') {
      const registry = await this.db.shareholderRegistry.findUnique({
        where:  { playerId_tickerId: { playerId, tickerId } },
        select: { sharesCount: true },
      });
      if (!registry || registry.sharesCount < qty) {
        throw new Error(
          `Недостатньо акцій для продажу: є ${registry?.sharesCount ?? 0}, потрібно ${qty}.`,
        );
      }
    } else {
      const player = await this.db.player.findUniqueOrThrow({
        where:  { id: playerId },
        select: { cashBalance: true },
      });
      const totalCost = price.times(qty.toString());
      if (new Decimal(player.cashBalance.toString()).lessThan(totalCost)) {
        throw new Error(
          `Недостатньо коштів: потрібно ₴${totalCost.toFixed(0)}, є ₴${player.cashBalance}.`,
        );
      }
    }

    const order = await this.db.stockOrderBook.create({
      data: {
        tickerId,
        type,
        placedByPlayerId: playerId,
        pricePerShareUah: price,
        quantity:         qty,
        status:           'OPEN',
        createdAtTick:    currentTick,
      },
    });

    return { orderId: order.id };
  }

  /** Скасовує власний ордер гравця. */
  async cancelStockOrder(orderId: string, playerId: string, currentTick: bigint): Promise<void> {
    const order = await this.db.stockOrderBook.findUniqueOrThrow({ where: { id: orderId } });
    if (order.placedByPlayerId !== playerId) {
      throw new Error('Ви можете скасувати лише власні ордери.');
    }
    if (order.status === 'FILLED' || order.status === 'CANCELLED') {
      throw new Error(`Ордер вже у статусі "${order.status}".`);
    }
    await this.db.stockOrderBook.update({
      where: { id: orderId },
      data:  { status: 'CANCELLED', cancelledAtTick: currentTick },
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // МАТЧИНГ ОРДЕРІВ
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Виконує матчинг BUY/SELL ордерів для тікера у Serializable-транзакції.
   *
   * Алгоритм price-time priority:
   *   BUY-ордери відсортовані за: price DESC → createdAtTick ASC
   *   SELL-ордери відсортовані за: price ASC  → createdAtTick ASC
   *
   *   Поки топ-BUY.price ≥ топ-SELL.price:
   *     executionPrice = SELL.price  (maker = той, чий ордер стоїть в книзі раніше)
   *     execQty = min(buyRemaining, sellRemaining)
   *
   *   Для SELL від treasury (placedByPlayerId = null):
   *     freeFloatShares -= execQty; засновник отримує UAH (IPO_PROCEEDS)
   *   Для SELL від реального гравця:
   *     ShareholderRegistry[seller] -= execQty; seller.cashBalance += cost
   *
   *   Неможливість виконати ордер (недостатньо коштів або акцій при re-validate):
   *     → ордер скасовується і пропускається
   */
  async matchStockOrders(tickerId: string, currentTick: bigint): Promise<MatchResult> {
    return this.db.$transaction(async tx => {
      // Завантажуємо тікер та його засновника
      const ticker = await tx.stockTicker.findUniqueOrThrow({
        where:   { id: tickerId },
        select: {
          id:                 true,
          playerId:           true,
          totalSharesIssued:  true,
          freeFloatShares:    true,
          lastTradedPriceUah: true,
        },
      });

      // Price-time sorted orders
      const buys = await tx.stockOrderBook.findMany({
        where:   { tickerId, type: 'BUY',  status: { in: ['OPEN', 'PARTIALLY_FILLED'] } },
        orderBy: [{ pricePerShareUah: 'desc' }, { createdAtTick: 'asc' }],
      });
      const sells = await tx.stockOrderBook.findMany({
        where:   { tickerId, type: 'SELL', status: { in: ['OPEN', 'PARTIALLY_FILLED'] } },
        orderBy: [{ pricePerShareUah: 'asc' },  { createdAtTick: 'asc' }],
      });

      let bi = 0, si = 0;
      let tradesExecuted = 0;
      let sharesTraded   = 0n;
      let volumeUah      = new Decimal(0);
      let lastPrice: Decimal | null = null;

      while (bi < buys.length && si < sells.length) {
        const buy  = buys[bi];
        const sell = sells[si];

        const buyPrice  = new Decimal(buy.pricePerShareUah.toString());
        const sellPrice = new Decimal(sell.pricePerShareUah.toString());

        if (buyPrice.lessThan(sellPrice)) break;  // жодного матчу більше немає

        const buyRemaining  = buy.quantity  - buy.filledQuantity;
        const sellRemaining = sell.quantity - sell.filledQuantity;
        const execQty       = buyRemaining < sellRemaining ? buyRemaining : sellRemaining;
        const execPrice     = sellPrice;                       // maker = продавець
        const totalCost     = execPrice.times(execQty.toString());

        // ── Re-validate buyer (Serializable гарантує відсутність phantom reads) ──
        if (!buy.placedByPlayerId) { bi++; continue; }  // купувати може тільки реальний гравець

        const buyer = await tx.player.findUniqueOrThrow({
          where:  { id: buy.placedByPlayerId },
          select: { cashBalance: true },
        });
        const buyerBalance = new Decimal(buyer.cashBalance.toString());
        if (buyerBalance.lessThan(totalCost)) {
          // Недостатньо коштів — скасовуємо BUY-ордер і переходимо до наступного
          await tx.stockOrderBook.update({
            where: { id: buy.id },
            data:  { status: 'CANCELLED', cancelledAtTick: currentTick },
          });
          bi++;
          continue;
        }

        // ── Re-validate seller ──────────────────────────────────────────────
        if (sell.placedByPlayerId !== null) {
          // Реальний гравець — перевіряємо ShareholderRegistry
          const sellerReg = await tx.shareholderRegistry.findUnique({
            where:  { playerId_tickerId: { playerId: sell.placedByPlayerId, tickerId } },
            select: { sharesCount: true },
          });
          if (!sellerReg || sellerReg.sharesCount < execQty) {
            await tx.stockOrderBook.update({
              where: { id: sell.id },
              data:  { status: 'CANCELLED', cancelledAtTick: currentTick },
            });
            si++;
            continue;
          }

          // ── Виконуємо угоду: реальний продавець ──────────────────────────
          const newSellerShares = sellerReg.sharesCount - execQty;
          if (newSellerShares === 0n) {
            await tx.shareholderRegistry.delete({
              where: { playerId_tickerId: { playerId: sell.placedByPlayerId, tickerId } },
            });
          } else {
            await tx.shareholderRegistry.update({
              where: { playerId_tickerId: { playerId: sell.placedByPlayerId, tickerId } },
              data:  { sharesCount: newSellerShares },
            });
          }

          // Виручка продавця
          const sellerData = await tx.player.findUniqueOrThrow({
            where:  { id: sell.placedByPlayerId },
            select: { cashBalance: true },
          });
          const sellerBalBefore = new Decimal(sellerData.cashBalance.toString());
          const sellerBalAfter  = sellerBalBefore.plus(totalCost);
          await tx.player.update({
            where: { id: sell.placedByPlayerId },
            data:  { cashBalance: sellerBalAfter },
          });
          await tx.financialTransaction.create({
            data: {
              playerId:      sell.placedByPlayerId,
              type:          'STOCK_SELL',
              amountUah:     totalCost,
              balanceBefore: sellerBalBefore,
              balanceAfter:  sellerBalAfter,
              description:   `Продаж ${execQty} акц. ${ticker.id} @ ₴${execPrice.toFixed(4)}`,
              referenceId:   tickerId,
            },
          });

        } else {
          // ── Treasury/float SELL — акції з freeFloatShares ──────────────────
          const currentFloat = ticker.freeFloatShares;
          if (currentFloat < execQty) {
            await tx.stockOrderBook.update({
              where: { id: sell.id },
              data:  { status: 'CANCELLED', cancelledAtTick: currentTick },
            });
            si++;
            continue;
          }

          // Оновлюємо freeFloat локально (ticker мутується тільки наприкінці)
          // Використовуємо пряме UPDATE, щоб Prisma не конфліктував з фінальним UPDATE
          await tx.stockTicker.update({
            where: { id: tickerId },
            data:  { freeFloatShares: { decrement: execQty } },
          });

          // Виручка від float → засновник (IPO proceeds)
          const founderData = await tx.player.findUniqueOrThrow({
            where:  { id: ticker.playerId },
            select: { cashBalance: true },
          });
          const founderBalBefore = new Decimal(founderData.cashBalance.toString());
          const founderBalAfter  = founderBalBefore.plus(totalCost);
          await tx.player.update({
            where: { id: ticker.playerId },
            data:  { cashBalance: founderBalAfter },
          });
          await tx.financialTransaction.create({
            data: {
              playerId:      ticker.playerId,
              type:          'IPO_PROCEEDS',
              amountUah:     totalCost,
              balanceBefore: founderBalBefore,
              balanceAfter:  founderBalAfter,
              description:   `Float продаж: ${execQty} акц. @ ₴${execPrice.toFixed(4)}`,
              referenceId:   tickerId,
            },
          });
        }

        // ── Дебет покупця ───────────────────────────────────────────────────
        const buyerBalAfter = buyerBalance.minus(totalCost);
        await tx.player.update({
          where: { id: buy.placedByPlayerId },
          data:  { cashBalance: buyerBalAfter },
        });
        await tx.financialTransaction.create({
          data: {
            playerId:      buy.placedByPlayerId,
            type:          'STOCK_BUY',
            amountUah:     totalCost.negated(),
            balanceBefore: buyerBalance,
            balanceAfter:  buyerBalAfter,
            description:   `Купівля ${execQty} акц. @ ₴${execPrice.toFixed(4)}`,
            referenceId:   tickerId,
          },
        });

        // ── Зарахування акцій покупцю ───────────────────────────────────────
        await tx.shareholderRegistry.upsert({
          where:  { playerId_tickerId: { playerId: buy.placedByPlayerId, tickerId } },
          create: { playerId: buy.placedByPlayerId, tickerId, sharesCount: execQty },
          update: { sharesCount: { increment: execQty } },
        });

        // ── Оновлення статусу BUY-ордера ────────────────────────────────────
        const newBuyFilled = buy.filledQuantity + execQty;
        const buyDone      = newBuyFilled >= buy.quantity;
        await tx.stockOrderBook.update({
          where: { id: buy.id },
          data: {
            filledQuantity: newBuyFilled,
            status:         buyDone ? 'FILLED' : 'PARTIALLY_FILLED',
            ...(buyDone ? { filledAtTick: currentTick } : {}),
          },
        });
        if (buyDone) bi++;

        // ── Оновлення статусу SELL-ордера ───────────────────────────────────
        const newSellFilled = sell.filledQuantity + execQty;
        const sellDone      = newSellFilled >= sell.quantity;
        await tx.stockOrderBook.update({
          where: { id: sell.id },
          data: {
            filledQuantity: newSellFilled,
            status:         sellDone ? 'FILLED' : 'PARTIALLY_FILLED',
            ...(sellDone ? { filledAtTick: currentTick } : {}),
          },
        });
        if (sellDone) si++;

        // ── Статистика ───────────────────────────────────────────────────────
        lastPrice       = execPrice;
        sharesTraded   += execQty;
        volumeUah       = volumeUah.plus(totalCost);
        tradesExecuted++;
      }

      // ── Оновлюємо ціну та капіталізацію після всіх угод ──────────────────
      if (lastPrice !== null) {
        const reloadedTicker = await tx.stockTicker.findUniqueOrThrow({
          where:  { id: tickerId },
          select: { totalSharesIssued: true },
        });
        const newMarketCap = lastPrice.times(reloadedTicker.totalSharesIssued.toString());
        await tx.stockTicker.update({
          where: { id: tickerId },
          data: {
            lastTradedPriceUah: lastPrice,
            marketCapUah:       newMarketCap,
          },
        });
      }

      return { tickerId, tradesExecuted, sharesTraded, volumeUah, lastPriceUah: lastPrice };

    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ВИПЛАТА ДИВІДЕНДІВ
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Засновник розподіляє дивіденди пропорційно між усіма акціонерами.
   *
   * DPS = totalPoolUah / totalSharesIssued
   * payout_i = DPS × sharesCount_i
   *
   * Останній акціонер отримує залишок для нейтралізації рання округлення.
   * Serializable-ізоляція запобігає зміні реєстру акціонерів під час розподілу.
   */
  async distributeDividends(
    playerId:     string,
    totalPoolUah: number,
    currentTick:  bigint,
  ): Promise<DividendResult> {
    const pool = new Decimal(totalPoolUah.toFixed(2));
    if (pool.lte(0)) throw new Error('Сума дивідендів повинна бути більшою за 0.');

    return this.db.$transaction(async tx => {
      // Тікер засновника
      const ticker = await tx.stockTicker.findUniqueOrThrow({
        where:  { playerId },
        select: { id: true, symbol: true, totalSharesIssued: true, isActive: true },
      });
      if (!ticker.isActive) throw new Error('Тікер неактивний — виплата дивідендів заблокована.');

      // Перевіряємо баланс засновника
      const founder = await tx.player.findUniqueOrThrow({
        where:  { id: playerId },
        select: { cashBalance: true },
      });
      const founderBalance = new Decimal(founder.cashBalance.toString());
      if (founderBalance.lessThan(pool)) {
        throw new Error(
          `Недостатньо коштів для виплати дивідендів: ` +
          `потрібно ₴${pool.toFixed(0)}, є ₴${founderBalance.toFixed(0)}.`,
        );
      }

      // DPS
      const totalShares = new Decimal(ticker.totalSharesIssued.toString());
      const dps         = pool.dividedBy(totalShares);

      // Списуємо пул з балансу засновника
      const founderBalAfter = founderBalance.minus(pool);
      await tx.player.update({
        where: { id: playerId },
        data:  { cashBalance: founderBalAfter },
      });
      await tx.financialTransaction.create({
        data: {
          playerId:      playerId,
          type:          'DIVIDEND_PAYMENT',
          amountUah:     pool.negated(),
          balanceBefore: founderBalance,
          balanceAfter:  founderBalAfter,
          description:
            `Виплата дивідендів: ₴${pool.toFixed(0)} / ` +
            `${ticker.totalSharesIssued} акц. = ₴${dps.toFixed(4)} DPS`,
          referenceId:   ticker.id,
        },
      });

      // Завантажуємо реєстр акціонерів
      const shareholders = await tx.shareholderRegistry.findMany({
        where:   { tickerId: ticker.id },
        orderBy: { id: 'asc' },
      });

      if (shareholders.length === 0) {
        // Нікому виплачувати — повертаємо гроші засновнику (revert)
        await tx.player.update({
          where: { id: playerId },
          data:  { cashBalance: founderBalance },
        });
        return {
          tickerId:             ticker.id,
          symbol:               ticker.symbol,
          totalPoolUah:         pool,
          dividendPerShare:     dps,
          shareholdersRewarded: 0,
          totalPaidUah:         new Decimal(0),
        };
      }

      let totalPaid = new Decimal(0);

      for (let i = 0; i < shareholders.length; i++) {
        const entry   = shareholders[i];
        const isLast  = i === shareholders.length - 1;
        const shares  = new Decimal(entry.sharesCount.toString());

        // Останній акціонер отримує залишок щоб уникнути дробових втрат
        const payout = isLast
          ? pool.minus(totalPaid)
          : dps.times(shares).toDecimalPlaces(2, Decimal.ROUND_DOWN);

        if (payout.lte(0)) continue;

        const shrData = await tx.player.findUniqueOrThrow({
          where:  { id: entry.playerId },
          select: { cashBalance: true },
        });
        const shrBalBefore = new Decimal(shrData.cashBalance.toString());
        const shrBalAfter  = shrBalBefore.plus(payout);

        await tx.player.update({
          where: { id: entry.playerId },
          data:  { cashBalance: shrBalAfter },
        });
        await tx.financialTransaction.create({
          data: {
            playerId:      entry.playerId,
            type:          'REVENUE_INTEREST',
            amountUah:     payout,
            balanceBefore: shrBalBefore,
            balanceAfter:  shrBalAfter,
            description:
              `Дивіденди ${ticker.symbol}: ` +
              `${entry.sharesCount} акц. × ₴${dps.toFixed(4)} = ₴${payout.toFixed(2)}`,
            referenceId:   ticker.id,
          },
        });

        totalPaid = totalPaid.plus(payout);
      }

      return {
        tickerId:             ticker.id,
        symbol:               ticker.symbol,
        totalPoolUah:         pool,
        dividendPerShare:     dps,
        shareholdersRewarded: shareholders.length,
        totalPaidUah:         totalPaid,
      };

    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ТІКОВИЙ ПРОЦЕСОР ФОНДОВОГО РИНКУ
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Виконується кожен тік у TickEngine (крок 3l — після banking, перед taxes).
   *
   * Для кожного активного тікера:
   *   a. Оновлює targetValuationUah ← Player.companyValuationUah
   *   b. Обчислює impliedPriceUah = targetValuationUah / totalSharesIssued
   *   c. NPC-корекція (синтетичний тиск, без реальних UAH-транзакцій):
   *        ринок < фундаментал × 0.85 → підтягує ціну вгору 2%/тік
   *        ринок > фундаментал × 1.20 → тисне ціну вниз 2%/тік
   *        Швидкість: NPC_NUDGE_RATE (2%) за тік, з обмеженням до impliedPrice
   *   d. marketCapUah = totalSharesIssued × lastTradedPriceUah
   *   e. matchStockOrders — виконати наявні ордери за оновленою ціною
   */
  async processStockMarketTick(currentTick: bigint): Promise<StockMarketTickSummary> {
    const summary: StockMarketTickSummary = {
      tick:                currentTick,
      tickersProcessed:    0,
      totalTradesExecuted: 0,
      totalVolumeUah:      new Decimal(0),
      npcCorrections:      0,
    };

    const tickers = await this.db.stockTicker.findMany({
      where:   { isActive: true },
      include: { player: { select: { companyValuationUah: true } } },
    });

    for (const ticker of tickers) {
      summary.tickersProcessed++;

      const fundamentalVal = new Decimal(ticker.player.companyValuationUah.toString());
      const currentPrice   = new Decimal(ticker.lastTradedPriceUah.toString());
      const totalShares    = BigInt(ticker.totalSharesIssued);

      // impliedPrice = fundamental / shares; guard для нульового випуску
      const impliedPrice = totalShares > 0n
        ? fundamentalVal.dividedBy(totalShares.toString())
        : currentPrice;

      // ── NPC price nudge ──────────────────────────────────────────────────
      let newPrice    = currentPrice;
      let npcCorrected = false;

      if (impliedPrice.gt(0) && currentPrice.gt(0)) {
        const ratio = currentPrice.dividedBy(impliedPrice).toNumber();

        if (ratio < NPC_UNDERVALUED_THRESHOLD) {
          // Недооцінений: підтягуємо ціну вгору на NPC_NUDGE_RATE
          const nudge = currentPrice.times(NPC_NUDGE_RATE);
          newPrice    = Decimal.min(currentPrice.plus(nudge), impliedPrice);
          npcCorrected = true;
        } else if (ratio > NPC_OVERVALUED_THRESHOLD) {
          // Переоцінений: тиснемо ціну вниз на NPC_NUDGE_RATE
          const nudge = currentPrice.times(NPC_NUDGE_RATE);
          newPrice    = Decimal.max(currentPrice.minus(nudge), impliedPrice);
          npcCorrected = true;
        }
      }

      const newMarketCap = newPrice.times(totalShares.toString());

      await this.db.stockTicker.update({
        where: { id: ticker.id },
        data: {
          targetValuationUah:  fundamentalVal,
          lastTradedPriceUah:  newPrice,
          marketCapUah:        newMarketCap,
        },
      });

      if (npcCorrected) summary.npcCorrections++;

      // ── Виконуємо ордери (може оновити ціну ще раз якщо є угоди) ────────
      const matchResult = await this.matchStockOrders(ticker.id, currentTick)
        .catch(e => {
          console.error(`[StockExchange] matchStockOrders для ${ticker.id} failed:`, e);
          return null;
        });

      if (matchResult) {
        summary.totalTradesExecuted += matchResult.tradesExecuted;
        summary.totalVolumeUah       = summary.totalVolumeUah.plus(matchResult.volumeUah);
      }
    }

    return summary;
  }
}
