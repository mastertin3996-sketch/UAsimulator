/**
 * ForeignTradeService — міжнародна торгівля, валютний ринок і митне оформлення.
 *
 * Три рівні:
 *
 *   FX Market (Міжбанк):
 *     processFxMarketTick()   — оновлює курс USD/UAH кожен тік
 *     exchangeCurrency()      — конвертація з комерційним спредом 0.5%
 *
 *   Customs Pipeline (Митниця):
 *     executeExportOrder()    — продаж товару на світовий ринок за USD (0% ПДВ)
 *     executeImportProcurement() — закупівля за кордоном (мито 10% + ПДВ 20% → StateBudget)
 *
 *   Trade Tick (глобальний крок):
 *     processTradeTick()      — оновлення котирувань, FX, митне очищення/зберігання
 *
 * Математика курсу (UAH/USD):
 *   1. Mean-reversion: 3% тяжіння до базового курсу 41.50 за тік
 *   2. Торговельний баланс: кожен $1M чистого експорту → −0.1% курсу (UAH міцнішає)
 *   3. Шум: ±0.3% за тік (Gaussian random walk)
 *   4. Кордони: [30.00, 60.00] UAH/USD
 *
 * Митниця (імпорт):
 *   customsValueUah = totalUsd × fxRate
 *   importDuty      = customsValueUah × 10%
 *   importVat       = (customsValueUah + importDuty) × 20%   ← ПДВ нараховується на митну вартість + мито
 *   Обидва надходять до StateBudget (customsRevenueUah, accumulatedPdv)
 *
 * При недостатньому UAH для митниці → вантаж заморожується:
 *   500 UAH/тік складська плата; кожен тік повторна спроба оплатити мито
 *
 * Imported HIGH_TECH_MACHINERY: при очищенні знижує wearRatePerTick −30%
 * для всього обладнання підприємств гравця у місті призначення.
 */

import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

// ── Singleton IDs ─────────────────────────────────────────────────────────────
const FX_RATE_ID = 'fx-rate-singleton';
const BUDGET_ID  = 'fiscal-budget-singleton';

// ── FX параметри ──────────────────────────────────────────────────────────────
const BASE_RATE       = new Decimal('41.50');
const FX_MIN          = new Decimal('30.00');
const FX_MAX          = new Decimal('60.00');
const FX_SPREAD       = 0.005;                   // 0.5% bank spread
const MEAN_REVERSION  = 0.03;                    // 3%/тік тяжіння до BASE_RATE
const TRADE_SENSITIVITY = 1e-7;                  // $/$ → зміна % курсу
const NOISE_AMP       = 0.003;                   // ±0.3%/тік Gaussian noise

// ── Митниця ───────────────────────────────────────────────────────────────────
const IMPORT_DUTY_RATE   = 0.10;
const IMPORT_VAT_RATE    = 0.20;
const BORDER_TICKS       = 1n;             // 1 тік прикордонної обробки
const STORAGE_FEE_UAH    = new Decimal('500');  // UAH/тік для заморожених
const IMPORT_QUALITY     = 9.0;           // якість імпортованих товарів
const MACHINERY_WEAR_MUL = 0.70;          // −30% wearRatePerTick

// ── Котирування: базові ціни та волатильність ─────────────────────────────────
const DEFAULT_TICKERS: Array<{
  commodity:     string;
  baselineUsd:   number;
  volatilityPct: number;
}> = [
  { commodity: 'WHEAT',               baselineUsd: 240,    volatilityPct: 0.025 },
  { commodity: 'CORN',                baselineUsd: 220,    volatilityPct: 0.025 },
  { commodity: 'SUNFLOWER_OIL',       baselineUsd: 1_050,  volatilityPct: 0.022 },
  { commodity: 'IRON_ORE',            baselineUsd: 90,     volatilityPct: 0.018 },
  { commodity: 'STEEL_BILLETS',       baselineUsd: 520,    volatilityPct: 0.020 },
  { commodity: 'DIESEL_FUEL',         baselineUsd: 750,    volatilityPct: 0.030 },
  { commodity: 'HIGH_TECH_MACHINERY', baselineUsd: 15_000, volatilityPct: 0.010 },
];

const HIGH_QUALITY_MACHINERY = new Set(['HIGH_TECH_MACHINERY']);

// ── Типи результатів ──────────────────────────────────────────────────────────

export interface FxTickResult {
  previousRate:  Decimal;
  newRate:       Decimal;
  changePercent: number;
}

export interface ExchangeResult {
  direction:     'UAH_TO_USD' | 'USD_TO_UAH';
  amountIn:      Decimal;   // що віддав гравець
  amountOut:     Decimal;   // що отримав гравець
  effectiveRate: Decimal;   // курс зі спредом
  midRate:       Decimal;   // міжбанківський курс
}

export interface ExportOrderResult {
  declarationId: string;
  resource:      string;
  quantity:      number;
  priceUsd:      Decimal;
  totalUsd:      Decimal;
  fxRate:        Decimal;
  status:        'PENDING';
}

export interface ImportOrderResult {
  declarationId:   string;
  resource:        string;
  quantity:        number;
  priceUsd:        Decimal;
  totalUsd:        Decimal;
  customsValueUah: Decimal;
  importDuty:      Decimal;
  importVat:       Decimal;
  totalCustomsUah: Decimal;
  customsPaid:     boolean;
  frozenAtBorder:  boolean;
  fxRate:          Decimal;
}

export interface TradeTickSummary {
  tick:                        bigint;
  fxRate:                      Decimal;
  priceUpdates:                number;
  exportsCleared:              number;
  importsCleared:              number;
  storageFeesCharged:          number;
  frozenImportsClearAttempted: number;
}

// ═════════════════════════════════════════════════════════════════════════════

export class ForeignTradeService {
  constructor(private readonly db: PrismaClient) {}

  // ══════════════════════════════════════════════════════════════════════════
  // SEED (idempotent)
  // ══════════════════════════════════════════════════════════════════════════

  async seedTickers(): Promise<void> {
    for (const t of DEFAULT_TICKERS) {
      await this.db.globalMarketTicker.upsert({
        where:  { commodity: t.commodity },
        create: {
          commodity:        t.commodity,
          priceUsd:         new Decimal(t.baselineUsd),
          previousPriceUsd: new Decimal(t.baselineUsd),
          baselineUsd:      new Decimal(t.baselineUsd),
          volatilityPct:    t.volatilityPct,
          changePercent:    0,
        },
        update: {},  // не перезаписуємо активні котирування
      });
    }
  }

  async seedFxRate(): Promise<void> {
    await this.db.fxRateSingleton.upsert({
      where:  { id: FX_RATE_ID },
      create: {
        id:                  FX_RATE_ID,
        usdToUah:            BASE_RATE,
        baseRate:            BASE_RATE,
        cumulativeExportUsd: new Decimal(0),
        cumulativeImportUsd: new Decimal(0),
      },
      update: {},  // не скидаємо живий курс
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FX MARKET
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Оновлює міжбанківський курс за формулою:
   *   Δrate = meanReversion(3%) + tradeEffect + noise(±0.3%)
   *
   *   tradeEffect: чистий експорт (USD) × (-TRADE_SENSITIVITY) × rate
   *     → профіцит торгівлі → UAH міцнішає → rate знижується
   */
  async processFxMarketTick(currentTick: bigint): Promise<FxTickResult> {
    const fx = await this.db.fxRateSingleton.findUnique({ where: { id: FX_RATE_ID } });
    if (!fx) {
      await this.seedFxRate();
      return { previousRate: BASE_RATE, newRate: BASE_RATE, changePercent: 0 };
    }

    const current  = new Decimal(fx.usdToUah.toString());
    const base     = new Decimal(fx.baseRate.toString());
    const netExportUsd = new Decimal(fx.cumulativeExportUsd.toString())
      .minus(fx.cumulativeImportUsd.toString())
      .toNumber();

    const curNum         = current.toNumber();
    const meanRevForce   = (base.toNumber() - curNum) * MEAN_REVERSION;
    const tradeEffect    = -netExportUsd * TRADE_SENSITIVITY * curNum;
    const noise          = (Math.random() - 0.5) * 2 * NOISE_AMP * curNum;

    const newRaw  = curNum + meanRevForce + tradeEffect + noise;
    const newRate = Decimal.max(FX_MIN, Decimal.min(FX_MAX, new Decimal(newRaw.toFixed(4))));
    const changePct = newRate.minus(current).dividedBy(current).times(100).toNumber();

    await this.db.fxRateSingleton.update({
      where: { id: FX_RATE_ID },
      data:  { usdToUah: newRate, lastUpdatedTick: currentTick },
    });

    return { previousRate: current, newRate, changePercent: changePct };
  }

  /**
   * Конвертація валюти через комерційний банк зі спредом 0.5%.
   *
   *   UAH_TO_USD: гравець передає `amount` UAH → отримує amount / (rate × 1.005) USD
   *   USD_TO_UAH: гравець передає `amount` USD → отримує amount × (rate × 0.995) UAH
   */
  async exchangeCurrency(
    playerId:  string,
    direction: 'UAH_TO_USD' | 'USD_TO_UAH',
    amount:    number,
  ): Promise<ExchangeResult> {
    if (amount <= 0) throw new Error('Сума конвертації повинна бути > 0');

    const [fx, player] = await Promise.all([
      this.db.fxRateSingleton.findUniqueOrThrow({ where: { id: FX_RATE_ID } }),
      this.db.player.findUniqueOrThrow({ where: { id: playerId } }),
    ]);

    const midRate    = new Decimal(fx.usdToUah.toString());
    const uahBalance = new Decimal(player.cashBalance.toString());
    const usdBalance = new Decimal(player.balanceUsd.toString());

    if (direction === 'UAH_TO_USD') {
      const effectiveRate = midRate.times(1 + FX_SPREAD);  // банк продає USD дорожче
      const uahIn  = new Decimal(amount.toFixed(2));
      const usdOut = uahIn.dividedBy(effectiveRate);

      if (uahBalance.lessThan(uahIn)) {
        throw new Error(`Недостатньо UAH: маєте ₴${uahBalance.toFixed(2)}, потрібно ₴${uahIn.toFixed(2)}`);
      }

      const newUah = uahBalance.minus(uahIn);
      const newUsd = usdBalance.plus(usdOut);

      await this.db.$transaction([
        this.db.player.update({
          where: { id: playerId },
          data:  { cashBalance: newUah, balanceUsd: newUsd },
        }),
        this.db.financialTransaction.create({
          data: {
            playerId,
            type:          'FX_EXCHANGE_BUY',
            amountUah:     uahIn.negated(),
            balanceBefore: uahBalance,
            balanceAfter:  newUah,
            description:
              `FX UAH→USD: −₴${uahIn.toFixed(2)} @ ${effectiveRate.toFixed(4)} ` +
              `→ +$${usdOut.toFixed(4)} (міжбанк ${midRate.toFixed(4)}, спред +0.5%)`,
            referenceId: FX_RATE_ID,
          },
        }),
      ]);

      return { direction, amountIn: uahIn, amountOut: usdOut, effectiveRate, midRate };

    } else {
      const effectiveRate = midRate.times(1 - FX_SPREAD);  // банк купує USD дешевше
      const usdIn  = new Decimal(amount.toFixed(4));
      const uahOut = usdIn.times(effectiveRate);

      if (usdBalance.lessThan(usdIn)) {
        throw new Error(`Недостатньо USD: маєте $${usdBalance.toFixed(4)}, потрібно $${usdIn.toFixed(4)}`);
      }

      const newUsd = usdBalance.minus(usdIn);
      const newUah = uahBalance.plus(uahOut);

      await this.db.$transaction([
        this.db.player.update({
          where: { id: playerId },
          data:  { cashBalance: newUah, balanceUsd: newUsd },
        }),
        this.db.financialTransaction.create({
          data: {
            playerId,
            type:          'FX_EXCHANGE_SELL',
            amountUah:     uahOut,
            balanceBefore: uahBalance,
            balanceAfter:  newUah,
            description:
              `FX USD→UAH: −$${usdIn.toFixed(4)} @ ${effectiveRate.toFixed(4)} ` +
              `→ +₴${uahOut.toFixed(2)} (міжбанк ${midRate.toFixed(4)}, спред −0.5%)`,
            referenceId: FX_RATE_ID,
          },
        }),
      ]);

      return { direction, amountIn: usdIn, amountOut: uahOut, effectiveRate, midRate };
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EXPORT ORDER
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Продаж товару на світовий ринок:
   *   1. Знаходить товар за SKU та перевіряє інвентар складу
   *   2. Списує зі складу
   *   3. Створює CustomsDeclaration (PENDING, тип EXPORT)
   *   4. Оновлює cumulativeExportUsd у FxRateSingleton
   *
   * USD-виторг зараховується в processTradeTick() через 1 тік (митна обробка).
   * ПДВ 0% — стандартна норма ПКУ для експорту.
   */
  async executeExportOrder(
    playerId:     string,
    enterpriseId: string,
    resource:     string,
    quantity:     number,
  ): Promise<ExportOrderResult> {
    if (quantity <= 0) throw new Error('Кількість має бути > 0');

    const [product, ticker, fx] = await Promise.all([
      this.db.product.findFirst({ where: { OR: [{ sku: resource }, { id: resource }] } }),
      this.db.globalMarketTicker.findUnique({ where: { commodity: resource } }),
      this.db.fxRateSingleton.findUniqueOrThrow({ where: { id: FX_RATE_ID } }),
    ]);

    if (!ticker) {
      throw new Error(`Немає котирування на світовому ринку для "${resource}". Перевірте commodity-код.`);
    }
    if (!product) {
      throw new Error(`Продукт "${resource}" не знайдений у каталозі гри.`);
    }

    const fxRate   = new Decimal(fx.usdToUah.toString());
    const priceUsd = new Decimal(ticker.priceUsd.toString());
    const totalUsd = priceUsd.times(quantity);

    // Знаходимо склад: або конкретний enterpriseId, або будь-який WAREHOUSE з запасом
    const warehouse = await this.db.enterprise.findFirst({
      where: {
        playerId,
        type:          'WAREHOUSE',
        isOperational: true,
        id:            enterpriseId,
        inventory:     { some: { productId: product.id, quantity: { gte: quantity } } },
      },
      include: { inventory: { where: { productId: product.id } } },
    });

    if (!warehouse) {
      throw new Error(
        `Склад ${enterpriseId} не містить ≥ ${quantity} од. "${product.nameUa}". ` +
        `Перевірте наявність або вкажіть інший склад.`,
      );
    }

    const invRow     = warehouse.inventory[0]!;
    const currentTick = await this.getLastTick();

    return this.db.$transaction(async tx => {
      // Списуємо зі складу
      await tx.enterpriseInventory.update({
        where: { id: invRow.id },
        data:  { quantity: invRow.quantity - quantity },
      });

      // Митна декларація
      const declaration = await tx.customsDeclaration.create({
        data: {
          playerId,
          type:             'EXPORT',
          status:           'PENDING',
          resourceType:     resource,
          quantity,
          customsValueUsd:  totalUsd,
          fxRateAtCreation: fxRate,
          createdAtTick:    currentTick,
        },
      });

      // Оновлюємо торговельний баланс
      await tx.fxRateSingleton.update({
        where: { id: FX_RATE_ID },
        data:  { cumulativeExportUsd: { increment: totalUsd } },
      });

      return { declarationId: declaration.id, resource, quantity, priceUsd, totalUsd, fxRate, status: 'PENDING' as const };
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // IMPORT PROCUREMENT
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Закупівля за кордоном:
   *   1. Гравець платить totalUsd із balanceUsd постачальнику
   *   2. Митниця нараховує mito (10%) + ПДВ (20% від CIF+мито) у UAH
   *      → обидва йдуть до StateBudget
   *   3. Якщо balanceUah < totalCustomsUah → вантаж ЗАМОРОЖЕНИЙ (500 UAH/тік)
   *   4. CustomsDeclaration PENDING → cleared у processTradeTick() через 1 тік
   *
   * Митна формула (ст. 368 МКУ + ст. 321 ПКУ):
   *   customsValueUah = totalUsd × fxRate
   *   importDuty      = customsValueUah × 10%
   *   importVat       = (customsValueUah + importDuty) × 20%
   */
  async executeImportProcurement(
    playerId:          string,
    destinationCityId: string,
    resource:          string,
    quantity:          number,
  ): Promise<ImportOrderResult> {
    if (quantity <= 0) throw new Error('Кількість має бути > 0');

    const [ticker, fx, player] = await Promise.all([
      this.db.globalMarketTicker.findUnique({ where: { commodity: resource } }),
      this.db.fxRateSingleton.findUniqueOrThrow({ where: { id: FX_RATE_ID } }),
      this.db.player.findUniqueOrThrow({ where: { id: playerId } }),
    ]);

    if (!ticker) {
      throw new Error(`Немає котирування на світовому ринку для "${resource}".`);
    }

    const fxRate          = new Decimal(fx.usdToUah.toString());
    const priceUsd        = new Decimal(ticker.priceUsd.toString());
    const totalUsd        = priceUsd.times(quantity);
    const customsValueUah = totalUsd.times(fxRate);
    const importDuty      = customsValueUah.times(IMPORT_DUTY_RATE);
    const importVat       = customsValueUah.plus(importDuty).times(IMPORT_VAT_RATE);
    const totalCustomsUah = importDuty.plus(importVat);

    const usdBalance = new Decimal(player.balanceUsd.toString());
    const uahBalance = new Decimal(player.cashBalance.toString());

    if (usdBalance.lessThan(totalUsd)) {
      throw new Error(
        `Недостатньо USD: маєте $${usdBalance.toFixed(4)}, ` +
        `потрібно $${totalUsd.toFixed(4)} (${quantity} × $${priceUsd.toFixed(4)})`,
      );
    }

    const canPayCustoms = uahBalance.greaterThanOrEqualTo(totalCustomsUah);
    const currentTick   = await this.getLastTick();

    return this.db.$transaction(async tx => {
      // Списуємо USD з балансу гравця (оплата постачальнику)
      await tx.player.update({
        where: { id: playerId },
        data:  { balanceUsd: { decrement: totalUsd } },
      });

      let dutyPaidUah = new Decimal(0);
      let vatPaidUah  = new Decimal(0);

      if (canPayCustoms) {
        const afterDuty    = uahBalance.minus(importDuty);
        const afterDutyVat = uahBalance.minus(totalCustomsUah);

        // Списуємо митні платежі з UAH
        await tx.player.update({
          where: { id: playerId },
          data:  { cashBalance: { decrement: totalCustomsUah } },
        });

        // Транзакційні записи митних платежів
        await tx.financialTransaction.create({
          data: {
            playerId,
            type:          'CUSTOMS_DUTY',
            amountUah:     importDuty.negated(),
            balanceBefore: uahBalance,
            balanceAfter:  afterDuty,
            description:
              `Ввізне мито 10%: ${quantity} od. "${resource}" ` +
              `(₴${customsValueUah.toFixed(0)} митна вартість)`,
            referenceId: destinationCityId,
          },
        });

        await tx.financialTransaction.create({
          data: {
            playerId,
            type:          'CUSTOMS_VAT',
            amountUah:     importVat.negated(),
            balanceBefore: afterDuty,
            balanceAfter:  afterDutyVat,
            description:
              `ПДВ при імпорті 20%: ${quantity} od. "${resource}" ` +
              `(база: ₴${customsValueUah.plus(importDuty).toFixed(0)})`,
            referenceId: destinationCityId,
          },
        });

        // Митні надходження → StateBudget
        const budget = await tx.stateBudget.findUnique({ where: { id: BUDGET_ID } });
        if (budget) {
          await tx.stateBudget.update({
            where: { id: BUDGET_ID },
            data: {
              totalTaxRevenue:   { increment: totalCustomsUah },
              accumulatedPdv:    { increment: importVat },
              customsRevenueUah: { increment: totalCustomsUah },
            },
          });
        }

        dutyPaidUah = importDuty;
        vatPaidUah  = importVat;
      }

      // Реєструємо USD-платіж у лежері (UAH-еквівалент для звітності)
      const usdEquivUah = totalUsd.times(fxRate);
      await tx.financialTransaction.create({
        data: {
          playerId,
          type:          'IMPORT_PURCHASE',
          amountUah:     usdEquivUah.negated(),
          balanceBefore: uahBalance,
          balanceAfter:  canPayCustoms ? uahBalance.minus(totalCustomsUah) : uahBalance,
          description:
            `Імпорт: ${quantity} od. "${resource}" @ $${priceUsd.toFixed(4)} = ` +
            `$${totalUsd.toFixed(4)} (≈₴${usdEquivUah.toFixed(0)}) | ` +
            (canPayCustoms
              ? `митниця ₴${totalCustomsUah.toFixed(0)} сплачено`
              : `⛔ ЗАМОРОЖЕНО: бракує ₴${totalCustomsUah.minus(uahBalance).toFixed(0)} для митниці`),
          referenceId: destinationCityId,
        },
      });

      // Митна декларація
      const declaration = await tx.customsDeclaration.create({
        data: {
          playerId,
          type:             'IMPORT',
          status:           'PENDING',
          resourceType:     resource,
          quantity,
          customsValueUsd:  totalUsd,
          dutyPaidUah,
          vatPaidUah,
          fxRateAtCreation: fxRate,
          destinationCityId,
          createdAtTick:    currentTick,
        },
      });

      // Оновлюємо торговельний баланс
      await tx.fxRateSingleton.update({
        where: { id: FX_RATE_ID },
        data:  { cumulativeImportUsd: { increment: totalUsd } },
      });

      return {
        declarationId:   declaration.id,
        resource,
        quantity,
        priceUsd,
        totalUsd,
        customsValueUah,
        importDuty,
        importVat,
        totalCustomsUah,
        customsPaid:     canPayCustoms,
        frozenAtBorder:  !canPayCustoms,
        fxRate,
      };
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PROCESS TRADE TICK (глобальний тіковий крок)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Виконується кожен тік у TickEngine (глобально, перед циклом гравців):
   *   1. Оновлює світові котирування (mean-reversion random walk)
   *   2. Перераховує FX-курс
   *   3. Очищує PENDING EXPORT-декларації (createdAtTick ≤ current - 1)
   *      → зараховує USD до balanceUsd гравця
   *   4. Очищує PENDING IMPORT-декларації (мито сплачено, createdAtTick ≤ current - 1)
   *      → доставляє товар на склад або playerInventory
   *   5. Для FROZEN IMPORT (мито не сплачено):
   *      → знімає 500 UAH складської плати
   *      → повторно намагається оплатити мито
   */
  async processTradeTick(currentTick: bigint): Promise<TradeTickSummary> {
    const summary: TradeTickSummary = {
      tick:                        currentTick,
      fxRate:                      BASE_RATE,
      priceUpdates:                0,
      exportsCleared:              0,
      importsCleared:              0,
      storageFeesCharged:          0,
      frozenImportsClearAttempted: 0,
    };

    // ── 1. Оновлення котирувань ──────────────────────────────────────────────
    await this.updateGlobalTickers(currentTick);
    summary.priceUpdates = DEFAULT_TICKERS.length;

    // ── 2. FX rate ───────────────────────────────────────────────────────────
    const fxResult = await this.processFxMarketTick(currentTick);
    summary.fxRate  = fxResult.newRate;

    // ── 3+4+5. Митні декларації ──────────────────────────────────────────────
    const pendingExports = await this.db.customsDeclaration.findMany({
      where: {
        type:          'EXPORT',
        status:        'PENDING',
        createdAtTick: { lte: currentTick - BORDER_TICKS },
      },
    });

    for (const decl of pendingExports) {
      await this.clearExport(decl, currentTick);
      summary.exportsCleared++;
    }

    // Завантажуємо всі PENDING IMPORT за один запит
    const allPendingImports = await this.db.customsDeclaration.findMany({
      where: { type: 'IMPORT', status: 'PENDING' },
    });

    for (const decl of allPendingImports) {
      const dutyPaid = new Decimal(decl.dutyPaidUah.toString());

      if (dutyPaid.greaterThan(0) && decl.createdAtTick <= currentTick - BORDER_TICKS) {
        // Мито сплачено, очікування завершилось → очистити
        await this.clearImport(decl, currentTick);
        summary.importsCleared++;
      } else if (dutyPaid.isZero()) {
        // Заморожений вантаж → спроба оплатити мито, стягнути складську плату
        await this.handleFrozenImport(decl, currentTick);
        summary.frozenImportsClearAttempted++;
        summary.storageFeesCharged++;
      }
    }

    return summary;
  }

  // ── Приватне: оновлення котирувань ────────────────────────────────────────

  private async updateGlobalTickers(currentTick: bigint): Promise<void> {
    const tickers = await this.db.globalMarketTicker.findMany();

    for (const t of tickers) {
      const current  = new Decimal(t.priceUsd.toString());
      const baseline = new Decimal(t.baselineUsd.toString());

      // Mean-reversion: 2% тяжіння до baseline + шум
      const meanRev  = (baseline.toNumber() - current.toNumber()) * 0.02;
      const noise    = (Math.random() - 0.5) * 2 * t.volatilityPct * current.toNumber();
      const newRaw   = Math.max(baseline.toNumber() * 0.40, current.toNumber() + meanRev + noise);
      const newPrice = new Decimal(newRaw.toFixed(4));
      const changePct = newPrice.minus(current).dividedBy(current).times(100).toNumber();

      await this.db.globalMarketTicker.update({
        where: { id: t.id },
        data: {
          previousPriceUsd: current,
          priceUsd:         newPrice,
          changePercent:    changePct,
          updatedAtTick:    currentTick,
        },
      });
    }
  }

  // ── Приватне: очищення EXPORT ─────────────────────────────────────────────

  private async clearExport(decl: { id: string; playerId: string; customsValueUsd: unknown; fxRateAtCreation: unknown; quantity: number; resourceType: string }, currentTick: bigint): Promise<void> {
    const usdAmount = new Decimal(String(decl.customsValueUsd));
    const fxAtTime  = new Decimal(String(decl.fxRateAtCreation));
    const uahEquiv  = usdAmount.times(fxAtTime);

    const player      = await this.db.player.findUniqueOrThrow({ where: { id: decl.playerId } });
    const cashBefore  = new Decimal(player.cashBalance.toString());

    await this.db.$transaction([
      // Зараховуємо USD на валютний рахунок
      this.db.player.update({
        where: { id: decl.playerId },
        data:  { balanceUsd: { increment: usdAmount } },
      }),
      // Оновлюємо декларацію
      this.db.customsDeclaration.update({
        where: { id: decl.id },
        data:  { status: 'CLEARED', clearedAtTick: currentTick },
      }),
      // Фінансовий запис (UAH-еквівалент для P&L-звітності)
      this.db.financialTransaction.create({
        data: {
          playerId:      decl.playerId,
          type:          'EXPORT_SALE',
          amountUah:     uahEquiv,   // умовний дохід у гривні для лежера
          balanceBefore: cashBefore,
          balanceAfter:  cashBefore, // UAH баланс не змінюється (приходить USD)
          description:
            `Митниця (Експорт) ✓: ${decl.quantity} od. "${decl.resourceType}" ` +
            `+$${usdAmount.toFixed(4)} ≈ +₴${uahEquiv.toFixed(0)} за курсом ${fxAtTime.toFixed(4)}`,
          referenceId: decl.id,
        },
      }),
    ]);
  }

  // ── Приватне: очищення IMPORT ─────────────────────────────────────────────

  private async clearImport(
    decl: {
      id: string; playerId: string; resourceType: string; quantity: number;
      destinationCityId: string | null;
    },
    currentTick: bigint,
  ): Promise<void> {
    // Доставка товару
    if (decl.destinationCityId) {
      await this.deliverImportedGoods(decl.playerId, decl.resourceType, decl.quantity, decl.destinationCityId);
    } else {
      await this.deliverToPlayerInventory(decl.playerId, decl.resourceType, decl.quantity);
    }

    // Апгрейд обладнання якщо HIGH_TECH_MACHINERY
    if (HIGH_QUALITY_MACHINERY.has(decl.resourceType) && decl.destinationCityId) {
      await this.applyMachineryUpgrade(decl.playerId, decl.destinationCityId);
    }

    await this.db.customsDeclaration.update({
      where: { id: decl.id },
      data:  { status: 'CLEARED', clearedAtTick: currentTick },
    });
  }

  // ── Приватне: доставка на склад ───────────────────────────────────────────

  private async deliverImportedGoods(
    playerId:          string,
    resource:          string,
    quantity:          number,
    destinationCityId: string,
  ): Promise<void> {
    const product = await this.db.product.findFirst({
      where: { OR: [{ sku: resource }, { id: resource }] },
    });
    if (!product) {
      // commodity не в каталозі — доставляємо в playerInventory без productId (fallback)
      await this.deliverToPlayerInventory(playerId, resource, quantity);
      return;
    }

    const warehouse = await this.db.enterprise.findFirst({
      where: {
        playerId,
        type:          'WAREHOUSE',
        isOperational: true,
        landPlot:      { cityId: destinationCityId },
      },
      include: { inventory: { where: { productId: product.id } } },
    });

    if (warehouse) {
      const existing = warehouse.inventory[0];
      if (existing) {
        const newQty  = existing.quantity + quantity;
        const newAvgQ = (existing.avgQuality * existing.quantity + IMPORT_QUALITY * quantity) / newQty;
        await this.db.enterpriseInventory.update({
          where: { id: existing.id },
          data:  { quantity: newQty, avgQuality: newAvgQ },
        });
      } else {
        await this.db.enterpriseInventory.create({
          data: { enterpriseId: warehouse.id, productId: product.id, quantity, avgQuality: IMPORT_QUALITY },
        });
      }
    } else {
      await this.deliverToPlayerInventory(playerId, resource, quantity);
    }
  }

  private async deliverToPlayerInventory(
    playerId:  string,
    resource:  string,
    quantity:  number,
  ): Promise<void> {
    const product = await this.db.product.findFirst({
      where: { OR: [{ sku: resource }, { id: resource }] },
    });
    if (!product) return; // commodity без відповідного продукту — ігноруємо

    const existing = await this.db.playerInventory.findUnique({
      where: { playerId_productId: { playerId, productId: product.id } },
    });
    if (existing) {
      const newQty  = existing.quantity + quantity;
      const newAvgQ = (existing.avgQuality * existing.quantity + IMPORT_QUALITY * quantity) / newQty;
      await this.db.playerInventory.update({
        where: { playerId_productId: { playerId, productId: product.id } },
        data:  { quantity: newQty, avgQuality: newAvgQ },
      });
    } else {
      await this.db.playerInventory.create({
        data: { playerId, productId: product.id, quantity, avgQuality: IMPORT_QUALITY },
      });
    }
  }

  // ── Приватне: апгрейд обладнання після HIGH_TECH_MACHINERY ───────────────

  private async applyMachineryUpgrade(playerId: string, cityId: string): Promise<void> {
    // Знаходимо підприємства гравця у місті-отримувачі
    const enterprises = await this.db.enterprise.findMany({
      where: { playerId, isOperational: true, landPlot: { cityId } },
      select: { id: true },
    });
    if (enterprises.length === 0) return;

    const enterpriseIds = enterprises.map(e => e.id);

    // Знижуємо wearRatePerTick на 30% для всього обладнання (мін. 0.001)
    await this.db.$executeRaw`
      UPDATE "Equipment" e
      SET    "wearRatePerTick" = GREATEST(0.001, e."wearRatePerTick" * ${MACHINERY_WEAR_MUL}::float)
      FROM   "Workshop" w
      WHERE  w.id               = e."workshopId"
        AND  w."enterpriseId"   = ANY(${enterpriseIds}::text[])
        AND  e."isBroken"       = false
    `;
  }

  // ── Приватне: стягнення плати та спроба розморозити ──────────────────────

  private async handleFrozenImport(
    decl: {
      id: string; playerId: string; resourceType: string; quantity: number;
      customsValueUsd: unknown; destinationCityId: string | null;
    },
    currentTick: bigint,
  ): Promise<void> {
    const player     = await this.db.player.findUniqueOrThrow({ where: { id: decl.playerId } });
    const uahBalance = new Decimal(player.cashBalance.toString());

    // Стягуємо складську плату (якщо є UAH)
    if (uahBalance.greaterThanOrEqualTo(STORAGE_FEE_UAH)) {
      const newBalance = uahBalance.minus(STORAGE_FEE_UAH);
      await this.db.$transaction([
        this.db.player.update({
          where: { id: decl.playerId },
          data:  { cashBalance: newBalance },
        }),
        this.db.customsDeclaration.update({
          where: { id: decl.id },
          data:  { storageFeeAccruedUah: { increment: STORAGE_FEE_UAH } },
        }),
        this.db.financialTransaction.create({
          data: {
            playerId:      decl.playerId,
            type:          'CUSTOMS_STORAGE_FEE',
            amountUah:     STORAGE_FEE_UAH.negated(),
            balanceBefore: uahBalance,
            balanceAfter:  newBalance,
            description:   `Складська плата (вантаж заморожено): "${decl.resourceType}" тік ${currentTick}`,
            referenceId:   decl.id,
          },
        }),
      ]);
    }

    // Перечитуємо актуальний баланс після оплати плати
    const fresh      = await this.db.player.findUniqueOrThrow({ where: { id: decl.playerId } });
    const freshUah   = new Decimal(fresh.cashBalance.toString());

    const fx         = await this.db.fxRateSingleton.findUnique({ where: { id: FX_RATE_ID } });
    const fxRate     = new Decimal(fx?.usdToUah.toString() ?? BASE_RATE.toString());
    const custVal    = new Decimal(String(decl.customsValueUsd)).times(fxRate);
    const duty       = custVal.times(IMPORT_DUTY_RATE);
    const vat        = custVal.plus(duty).times(IMPORT_VAT_RATE);
    const totalCust  = duty.plus(vat);

    if (freshUah.lessThan(totalCust)) return; // не вистачає — чекати далі

    // Оплачуємо мито та розморожуємо
    const afterDuty    = freshUah.minus(duty);
    const afterCustoms = freshUah.minus(totalCust);

    await this.db.$transaction([
      this.db.player.update({
        where: { id: decl.playerId },
        data:  { cashBalance: afterCustoms },
      }),
      // Оновлюємо декларацію: мито сплачено, скидаємо таймер черги
      this.db.customsDeclaration.update({
        where: { id: decl.id },
        data:  { dutyPaidUah: duty, vatPaidUah: vat, createdAtTick: currentTick },
      }),
      this.db.financialTransaction.create({
        data: {
          playerId:      decl.playerId,
          type:          'CUSTOMS_DUTY',
          amountUah:     totalCust.negated(),
          balanceBefore: freshUah,
          balanceAfter:  afterCustoms,
          description:
            `Митниця РОЗМОРОЖЕНА: "${decl.resourceType}" ` +
            `мито ₴${duty.toFixed(0)} + ПДВ ₴${vat.toFixed(0)} (тік ${currentTick})`,
          referenceId: decl.id,
        },
      }),
    ]);

    // Митні надходження → StateBudget
    const budget = await this.db.stateBudget.findUnique({ where: { id: BUDGET_ID } });
    if (budget) {
      await this.db.stateBudget.update({
        where: { id: BUDGET_ID },
        data: {
          totalTaxRevenue:   { increment: totalCust },
          accumulatedPdv:    { increment: vat },
          customsRevenueUah: { increment: totalCust },
        },
      });
    }
  }

  // ── Утиліта ───────────────────────────────────────────────────────────────

  private async getLastTick(): Promise<bigint> {
    const last = await this.db.gameTick.findFirst({ orderBy: { tickNumber: 'desc' } });
    return last?.tickNumber ?? 0n;
  }
}
