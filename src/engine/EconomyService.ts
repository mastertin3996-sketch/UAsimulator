/**
 * EconomyService — комерційний рівень UAeconomy.
 *
 * B2B: гравець → гравець через MarketOrder (SELL)
 * B2C: NPC-покупці → роздрібні магазини гравців за моделлю привабливості
 *
 * Українські нормативи 2026:
 *   ПДВ 20%, вбудований у роздрібну ціну (ціна = нетто × 1.20)
 *   Міжбанківська комісія B2B 1%
 */
import { PrismaClient, MarketOrderStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

// ── Фінансові константи ───────────────────────────────────────────────────────
const BANK_FEE_RATE = new Decimal('0.01');   // 1 % B2B комісія (утримується з продавця)
const VAT_RATE      = new Decimal('0.20');   // ПДВ 20 %

// Частка ПДВ у ціні "з ПДВ": ПДВ = ціна × (0.20 / 1.20) = ціна × 1/6
const VAT_INCLUSIVE_FRACTION = VAT_RATE.dividedBy(new Decimal('1').plus(VAT_RATE));

// Якщо гравець не виставив ордер — ціна роздробу: referencePrice × (1 + MARKUP)
const DEFAULT_RETAIL_MARKUP = 0.20;

// Термін дії B2B ордеру: 30 реальних днів
const ORDER_EXPIRY_MS = 30 * 24 * 3600 * 1000;

// ── Допоміжні типи ────────────────────────────────────────────────────────────
interface RetailCandidate {
  storeId:      string;
  playerId:     string;
  invRowId:     string;
  stockQty:     number;
  avgQuality:   number;
  retailPrice:  Decimal;
  staffEff:     number;  // 0.0–1.15 (середня ефективність активного персоналу)
  score:        number;  // бал привабливості
}

export interface B2BSaleReceipt {
  orderId:         string;
  quantityFilled:  number;
  grossCostUah:    Decimal;
  bankFeeUah:      Decimal;
  sellerNetUah:    Decimal;
  orderStatus:     MarketOrderStatus;
}

export interface B2CTickSummary {
  cityId:              string;
  totalProductsSold:   number;       // кількість різних SKU
  totalRevenueUah:     Decimal;      // сукупний виторг гравців (до ПДВ)
  totalVatCollected:   Decimal;      // ПДВ у сукупному виторзі
  storeResults: Array<{
    storeId:     string;
    playerId:    string;
    unitsSold:   number;
    revenueUah:  Decimal;
    vatUah:      Decimal;
  }>;
}

// ═════════════════════════════════════════════════════════════════════════════
export class EconomyService {
  constructor(private readonly prisma: PrismaClient) {}

  // ══════════════════════════════════════════════════════════════════════════
  // B2B: ВИСТАВЛЕННЯ ОРДЕРУ
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Виставляє SELL-ордер на B2B ринок зі складу продавця.
   *
   * @param sellerId    ID гравця-продавця
   * @param resource    SKU або UUID продукту
   * @param quantity    Кількість одиниць (> 0)
   * @param pricePerUnit Ціна за одиницю (UAH, > 0)
   * @param quality     Задекларована якість 0–10 (перевіряється проти фактичної)
   * @returns           ID створеного MarketOrder
   */
  async placeB2BOrder(
    sellerId:     string,
    resource:     string,
    quantity:     number,
    pricePerUnit: number,
    quality:      number,
  ): Promise<string> {
    if (quantity    <= 0)         throw new Error('Quantity must be greater than 0');
    if (pricePerUnit <= 0)        throw new Error('Price per unit must be greater than 0');
    if (quality < 0 || quality > 10) throw new Error('Quality must be in the range [0, 10]');

    // ── 1. Ідентифікація продукту (SKU або UUID) ──────────────────────────
    const product = await this.prisma.product.findFirst({
      where: { OR: [{ sku: resource }, { id: resource }] },
    });
    if (!product) throw new Error(`Product not found: "${resource}"`);

    // ── 2. Пошук складу продавця з необхідним запасом ────────────────────
    // Шукаємо будь-який операційний WAREHOUSE гравця, де кількість ≥ quantity.
    const warehouse = await this.prisma.enterprise.findFirst({
      where: {
        playerId:      sellerId,
        type:          'WAREHOUSE',
        isOperational: true,
        inventory: {
          some: {
            productId: product.id,
            quantity:  { gte: quantity },
          },
        },
      },
      include: {
        inventory: { where: { productId: product.id } },
      },
    });

    if (!warehouse) {
      throw new Error(
        `Seller has no operational WAREHOUSE with ≥ ${quantity} units of "${product.name}". ` +
        `Check inventory across all your warehouses.`,
      );
    }

    const invRow = warehouse.inventory[0]!;

    // ── 3. Перевірка якості (ліцензійна відповідність) ───────────────────
    // Задекларована якість може перевищувати фактичну не більш ніж на 0.5 балів.
    // Це запобігає маніпуляціям із завищеним оголошенням якості.
    if (invRow.avgQuality < quality - 0.5) {
      throw new Error(
        `Declared quality (${quality.toFixed(1)}) exceeds actual average batch quality ` +
        `(${invRow.avgQuality.toFixed(1)}) by more than 0.5 points. ` +
        `Adjust declared quality or improve the batch.`,
      );
    }

    // ── 4. Атомарне заморожування товару + створення ордеру ──────────────
    // Зменшуємо кількість на складі. Товар "заморожений" у ордері.
    // При скасуванні ордеру (cancelOrder) товар повертається на склад.
    const expiresAt = new Date(Date.now() + ORDER_EXPIRY_MS);

    const [, order] = await this.prisma.$transaction([
      this.prisma.enterpriseInventory.update({
        where: { id: invRow.id },
        data:  { quantity: invRow.quantity - quantity },
      }),
      this.prisma.marketOrder.create({
        data: {
          playerId:       sellerId,
          productId:      product.id,
          resourceType:   product.sku,    // денормалізований SKU для швидкого пошуку
          type:           'SELL',
          status:         'OPEN',
          pricePerUnit:   new Decimal(pricePerUnit.toString()),
          quality,
          quantityTotal:  quantity,
          quantityFilled: 0,
          expiresAt,
        },
      }),
    ]);

    return order.id;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // B2B: ВИКОНАННЯ УГОДИ
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Виконує B2B купівлю з існуючого SELL-ордеру в суворо атомарній транзакції.
   *
   * Захист від дюпу ресурсів (race conditions):
   *
   *   Проблема "читання → перевірка → запис" (read-check-write):
   *   Якщо два покупці одночасно читають ордер із залишком 100 одиниць
   *   і обидва намагаються купити по 80, наївна реалізація зарахує обом —
   *   160 одиниць з 100 (клонування ресурсу).
   *
   *   Те саме з балансом: якщо покупець має 10 000 UAH і ще одна транзакція
   *   знімає 8 000 між нашим read і нашим update, покупець "витратить" 16 000.
   *
   *   Рішення — CAS (Compare-And-Swap) через умовний UPDATE:
   *   PostgreSQL вираховує WHERE-умову UPDATE атомарно в момент запису,
   *   а не в момент попереднього читання. Якщо рядок змінено іншою tx,
   *   affected rows = 0 → ми кидаємо помилку → вся транзакція відкочується.
   *
   * Порядок операцій (важливо для уникнення дедлоків):
   *   1. Читання метаданих ордеру (без lock — лише для обчислень)
   *   2. Атомарна резервація кількості в ордері    (CAS updateMany)
   *   3. Читання балансу покупця                   (для audit-запису)
   *   4. Атомарне списання з покупця               (CAS updateMany)
   *   5. Зарахування продавцю                      (safe increment)
   *   6. Перечитання ордеру → оновлення статусу
   *   7. Передача товару
   *   8. Фінансові проводки
   *
   * @returns Деталі угоди (B2BSaleReceipt)
   */
  async executeB2BTrade(
    buyerId:          string,
    orderId:          string,
    purchaseQuantity: number,
  ): Promise<B2BSaleReceipt> {
    if (purchaseQuantity <= 0) throw new Error('Purchase quantity must be greater than 0');

    return this.prisma.$transaction(async tx => {

      // ── 1. Читання метаданих ордеру ───────────────────────────────────
      // Читаємо для отримання ціни, продавця, SKU.
      // Ще НЕ перевіряємо статус / кількість — це зробить атомарний UPDATE нижче.
      const order = await tx.marketOrder.findUnique({ where: { id: orderId } });
      if (!order) throw new Error(`Order ${orderId} not found`);
      if (order.type !== 'SELL') throw new Error('Only SELL orders can be purchased');
      if (order.playerId === buyerId) throw new Error('Cannot buy from yourself');

      const pricePerUnit = new Decimal(order.pricePerUnit.toString());
      const grossCostUah = pricePerUnit.times(purchaseQuantity);
      const bankFeeUah   = grossCostUah.times(BANK_FEE_RATE);
      const sellerNetUah = grossCostUah.minus(bankFeeUah);

      // ── 2. Атомарна резервація кількості (CAS) ────────────────────────
      // WHERE-умова оцінюється атомарно в момент UPDATE на рівні БД.
      // Це унеможливлює "подвійний продаж" навіть при паралельних запитах:
      //   - status: OPEN або PARTIALLY_FILLED   (продавець не скасував лот)
      //   - expiresAt > now                     (ордер не прострочений)
      //   - playerId != buyerId                 (подвійна перевірка само-торгівлі)
      //   - quantityFilled ≤ total−need         (залишку вистачає саме зараз)
      //
      // Якщо паралельна транзакція вже взяла частину залишку між нашим
      // read (крок 1) і цим UPDATE — PostgreSQL побачить оновлений quantityFilled
      // і WHERE-умова може не виконатись → count=0 → помилка → rollback.
      const claimed = await tx.marketOrder.updateMany({
        where: {
          id:             orderId,
          type:           'SELL',
          status:         { in: ['OPEN', 'PARTIALLY_FILLED'] },
          expiresAt:      { gt: new Date() },
          playerId:       { not: buyerId },
          // Ключова умова anti-dupe: залишок ≥ purchaseQuantity
          quantityFilled: { lte: order.quantityTotal - purchaseQuantity },
        },
        data: {
          quantityFilled: { increment: purchaseQuantity }, // атомарний приріст
        },
      });

      if (claimed.count === 0) {
        // Причина може бути будь-якою з WHERE-умов вище.
        // Перечитуємо для точного повідомлення (поза транзакцією не критично).
        const fresh = await tx.marketOrder.findUnique({ where: { id: orderId } });
        if (!fresh) throw new Error(`Order ${orderId} was deleted by the seller`);
        if (fresh.status === 'CANCELLED') throw new Error(`Order ${orderId} was cancelled by the seller`);
        if (fresh.status === 'FILLED')    throw new Error(`Order ${orderId} is fully sold out`);
        if (fresh.expiresAt <= new Date()) throw new Error(`Order ${orderId} has expired`);
        const remaining = fresh.quantityTotal - fresh.quantityFilled;
        throw new Error(
          `Concurrent conflict: only ${remaining.toFixed(4)} units remain, ` +
          `requested ${purchaseQuantity}. Retry the transaction.`,
        );
      }

      // ── 3. Читання балансу покупця (для audit-запису) ─────────────────
      const buyer       = await tx.player.findUniqueOrThrow({ where: { id: buyerId } });
      const buyerBefore = new Decimal(buyer.cashBalance.toString());

      // ── 4. Атомарне списання з покупця (CAS) ─────────────────────────
      // WHERE cashBalance >= grossCostUah атомарно перевіряє платоспроможність
      // в момент самого списання, а не в момент попереднього read.
      // Якщо між кроком 3 і цим UPDATE інша транзакція спустошила баланс —
      // WHERE не виконається → count=0 → помилка → відкат УСЬОГО, включно
      // з резервацією кількості ордеру (крок 2).
      const deducted = await tx.player.updateMany({
        where: {
          id:           buyerId,
          cashBalance:  { gte: grossCostUah },  // атомарна перевірка достатності
        },
        data: {
          cashBalance: { decrement: grossCostUah }, // атомарне списання
        },
      });

      if (deducted.count === 0) {
        // Баланс змінився між кроком 3 і цим UPDATE (паралельна транзакція)
        // або просто не вистачає коштів.
        throw new Error(
          `Insufficient funds: ₴${buyerBefore.toFixed(2)} available, ` +
          `₴${grossCostUah.toFixed(2)} required. ` +
          `Transaction rolled back (order quantity reservation reverted).`,
        );
      }
      const buyerAfter = buyerBefore.minus(grossCostUah);

      // ── 5. Зарахування продавцю (safe increment, валідація не потрібна) ─
      const seller       = await tx.player.findUniqueOrThrow({ where: { id: order.playerId } });
      const sellerBefore = new Decimal(seller.cashBalance.toString());
      const sellerAfter  = sellerBefore.plus(sellerNetUah);

      await tx.player.update({
        where: { id: order.playerId },
        data:  { cashBalance: { increment: sellerNetUah } }, // increment безпечний (лише дохід)
      });

      // ── 6. Перечитання ордеру → точний статус після конкурентних записів ─
      // Після нашого атомарного increment (крок 2) quantityFilled у БД може
      // відрізнятись від order.quantityFilled + purchaseQuantity, якщо між
      // кроком 1 і кроком 2 інша транзакція вже заповнила частину.
      // Перечитуємо актуальне значення і оновлюємо статус.
      const refreshed     = await tx.marketOrder.findUniqueOrThrow({ where: { id: orderId } });
      const isFullyFilled = refreshed.quantityFilled >= refreshed.quantityTotal - 0.0001;
      const newStatus: MarketOrderStatus = isFullyFilled ? 'FILLED' : 'PARTIALLY_FILLED';

      await tx.marketOrder.update({
        where: { id: orderId },
        data: {
          status:   newStatus,
          filledAt: isFullyFilled ? new Date() : undefined,
        },
      });

      // ── 7. Передача товару покупцю ────────────────────────────────────
      // Знаходимо склад продавця → визначаємо місто → шукаємо склад покупця.
      const sellerWarehouse = await tx.enterprise.findFirst({
        where:   { playerId: order.playerId, type: 'WAREHOUSE', isOperational: true },
        include: { landPlot: { select: { cityId: true } } },
      });
      const sellerCityId = sellerWarehouse?.landPlot.cityId ?? null;

      let deliveredToWarehouse = false;

      if (sellerCityId) {
        const buyerWarehouse = await tx.enterprise.findFirst({
          where: {
            playerId:      buyerId,
            type:          'WAREHOUSE',
            isOperational: true,
            landPlot:      { cityId: sellerCityId },
          },
          include: { inventory: { where: { productId: order.productId } } },
        });

        if (buyerWarehouse) {
          const quality   = order.quality ?? 7.0;
          const existing  = buyerWarehouse.inventory[0];
          if (existing) {
            const newQty  = existing.quantity + purchaseQuantity;
            const newAvgQ = (existing.avgQuality * existing.quantity + quality * purchaseQuantity) / newQty;
            await tx.enterpriseInventory.update({
              where: { id: existing.id },
              data:  { quantity: newQty, avgQuality: newAvgQ },
            });
          } else {
            await tx.enterpriseInventory.create({
              data: { enterpriseId: buyerWarehouse.id, productId: order.productId, quantity: purchaseQuantity, avgQuality: quality },
            });
          }
          deliveredToWarehouse = true;
        }
      }

      if (!deliveredToWarehouse) {
        const quality   = order.quality ?? 7.0;
        const existing  = await tx.playerInventory.findUnique({
          where: { playerId_productId: { playerId: buyerId, productId: order.productId } },
        });
        if (existing) {
          const newQty  = existing.quantity + purchaseQuantity;
          const newAvgQ = (existing.avgQuality * existing.quantity + quality * purchaseQuantity) / newQty;
          await tx.playerInventory.update({
            where: { playerId_productId: { playerId: buyerId, productId: order.productId } },
            data:  { quantity: newQty, avgQuality: newAvgQ },
          });
        } else {
          await tx.playerInventory.create({
            data: { playerId: buyerId, productId: order.productId, quantity: purchaseQuantity, avgQuality: quality },
          });
        }
      }

      // ── 8. Фінансові проводки ─────────────────────────────────────────
      const tradeLine =
        `${purchaseQuantity} × "${order.resourceType}" @ ₴${pricePerUnit.toFixed(2)}/од`;

      await tx.financialTransaction.createMany({
        data: [
          {
            playerId:      buyerId,
            type:          'MARKET_PURCHASE',
            amountUah:     grossCostUah.negated(),
            balanceBefore: buyerBefore,
            balanceAfter:  buyerAfter,
            description:   `B2B купівля: ${tradeLine}`,
            referenceId:   orderId,
          },
          {
            playerId:      order.playerId,
            type:          'MARKET_SALE',
            amountUah:     sellerNetUah,
            balanceBefore: sellerBefore,
            balanceAfter:  sellerAfter,
            description:   `B2B продаж: ${tradeLine} (−₴${bankFeeUah.toFixed(2)} комісія банку)`,
            referenceId:   orderId,
          },
        ],
      });

      return {
        orderId,
        quantityFilled:  purchaseQuantity,
        grossCostUah,
        bankFeeUah,
        sellerNetUah,
        orderStatus:     newStatus,
      };
    }, { timeout: 30_000 });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // B2C: РОЗДРІБНИЙ ТІК
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Моделює щоденний B2C роздрібний ринок у місті.
   *
   * Алгоритм для кожного NPC-товару:
   *
   *  1. Збираємо всі роздрібні магазини (RETAIL_STORE) у місті з цим товаром.
   *
   *  2. Бал привабливості магазину (Score):
   *     Score = Quality^1.5 / RetailPrice × StaffEfficiency
   *     де:  Quality      = avgQuality інвентарю (0–10)
   *          RetailPrice  = ціна з відкритого SELL-ордеру гравця АБО
   *                         referencePrice × 1.20 (якщо ордеру немає)
   *          StaffEfficiency = середня efficiency активного (не страйкуючого) персоналу
   *
   *  3. Зважена середня ринкова ціна по всіх магазинах (за Score):
   *     WeightedAvgPrice = Σ(price_i × score_i) / totalScore
   *
   *  4. Скоригований попит (price elasticity + city demand coefficient):
   *     adjustedDemand = baseUnitsPerDay
   *                    × (referencePrice / WeightedAvgPrice)^|priceElasticity|
   *                    × city.demandCoefficient
   *
   *  5. Розподіл попиту по магазинах (пропорційно Score):
   *     for store_i:
   *       marketShare_i = score_i / totalScore
   *       qualityFactor_i = qualityWeight × (quality_i / 10) + (1 − qualityWeight)
   *       unitsSold_i = min(stockQty_i, adjustedDemand × marketShare_i × qualityFactor_i)
   *
   *  6. Фінанси:
   *     revenue_i = unitsSold_i × retailPrice_i   (ціна "з ПДВ")
   *     vatInRevenue_i = revenue_i × (0.20 / 1.20) = revenue_i / 6
   *     netRevenue_i   = revenue_i − vatInRevenue_i
   *     → Гравець отримує повний revenue_i (ПДВ виставляється TaxService раз на місяць).
   *     → Запис NPC_SALE: повна сума з розшифровкою ПДВ у description.
   */
  async simulateB2CRetailTick(cityId: string): Promise<B2CTickSummary> {
    const city = await this.prisma.city.findUniqueOrThrow({ where: { id: cityId } });

    // ── Усі активні роздрібні магазини в місті ────────────────────────────
    const stores = await this.prisma.enterprise.findMany({
      where: {
        type:          'RETAIL_STORE',
        isOperational: true,
        landPlot:      { cityId },
      },
      include: {
        employees: { select: { efficiency: true, isOnStrike: true } },
        inventory: {
          include: { product: { select: { id: true, sku: true, nameUa: true } } },
        },
      },
    });

    const summary: B2CTickSummary = {
      cityId,
      totalProductsSold: 0,
      totalRevenueUah:   new Decimal(0),
      totalVatCollected: new Decimal(0),
      storeResults: [],
    };

    if (stores.length === 0) return summary;

    // ── NPC-попит у місті ─────────────────────────────────────────────────
    const demands = await this.prisma.npcDemand.findMany({
      where:   { cityId },
      include: { product: { select: { id: true, nameUa: true } } },
    });
    if (demands.length === 0) return summary;

    // ── Роздрібні ціни з RetailListing (встановлені гравцем) ────────────
    const sellerIds = [...new Set(stores.map(s => s.playerId))];
    const storeIds  = stores.map(s => s.id);
    const retailListings = await this.prisma.retailListing.findMany({
      where: { enterpriseId: { in: storeIds }, isActive: true },
    });

    // Заздалегідь завантажуємо баланси всіх власників для пакетного оновлення
    const players = await this.prisma.player.findMany({
      where: { id: { in: sellerIds } },
      select: { id: true, cashBalance: true },
    });
    // playerId → поточний Decimal-баланс (оновлюємо в пам'яті між ітераціями)
    const balanceCache = new Map<string, Decimal>(
      players.map(p => [p.id, new Decimal(p.cashBalance.toString())]),
    );

    // ── Обробка кожного товару з попиту ──────────────────────────────────
    for (const demand of demands) {
      const candidates: RetailCandidate[] = [];

      for (const store of stores) {
        const invRow = store.inventory.find(i => i.productId === demand.productId);
        if (!invRow || invRow.quantity < 0.001) continue;

        // Роздрібна ціна: RetailListing (гравець) або базова ціна + 20%
        const listing = retailListings.find(
          l => l.enterpriseId === store.id && l.productId === demand.productId,
        );
        const retailPrice: Decimal = listing
          ? new Decimal(listing.pricePerUnit.toString())
          : new Decimal(demand.referencePrice.toString()).times(1 + DEFAULT_RETAIL_MARKUP);

        // Ефективність персоналу (тільки активні, без страйкуючих)
        const activeStaff = store.employees.filter(e => !e.isOnStrike);
        const staffEff = activeStaff.length > 0
          ? activeStaff.reduce((s, e) => s + e.efficiency, 0) / activeStaff.length
          : 0.50; // без персоналу: мінімальний сервіс 50%

        const priceFloat = retailPrice.toNumber();
        if (priceFloat <= 0) continue;

        // Score = Quality^1.5 / RetailPrice × StaffEfficiency
        const score = Math.pow(invRow.avgQuality, 1.5) / priceFloat * staffEff;

        candidates.push({
          storeId:     store.id,
          playerId:    store.playerId,
          invRowId:    invRow.id,
          stockQty:    invRow.quantity,
          avgQuality:  invRow.avgQuality,
          retailPrice,
          staffEff,
          score,
        });
      }

      if (candidates.length === 0) continue;

      // ── Зважена середня ринкова ціна (для коригування попиту) ──────────
      const totalScore = candidates.reduce((s, c) => s + c.score, 0);
      const weightedAvgPrice = candidates.reduce(
        (sum, c) => sum + c.retailPrice.toNumber() * (c.score / totalScore),
        0,
      );

      // ── Скоригований попит через еластичність ──────────────────────────
      // adjustedDemand = baseUnitsPerDay
      //   × (referencePrice / weightedAvgPrice) ^ |priceElasticity|
      //   × demandCoefficient
      const refPrice      = demand.referencePrice.toNumber();
      const priceRatio    = refPrice / Math.max(weightedAvgPrice, 0.01);
      const elasticityAdj = Math.pow(priceRatio, Math.abs(demand.priceElasticity));
      const adjustedDemand = demand.baseUnitsPerDay * elasticityAdj * city.demandCoefficient;

      // ── Розподіл попиту між магазинами ─────────────────────────────────
      for (const c of candidates) {
        const marketShare   = c.score / totalScore;
        // Фактор якості: spoживач з qualityWeight-ймовірністю обирає за якістю
        const qualityFactor = demand.qualityWeight * (c.avgQuality / 10)
                            + (1 - demand.qualityWeight);
        const rawUnits    = adjustedDemand * marketShare * qualityFactor;
        const actualUnits = Math.min(c.stockQty, rawUnits);
        if (actualUnits < 0.001) continue;

        const revenue     = c.retailPrice.times(actualUnits);
        // ПДВ, вбудований у роздрібну ціну: revenue × (VAT / (1 + VAT))
        const vatAmount   = revenue.times(VAT_INCLUSIVE_FRACTION);
        const netRevenue  = revenue.minus(vatAmount);

        // ── Оновлення інвентарю магазину ───────────────────────────────
        const newQty = c.stockQty - actualUnits;
        await this.prisma.enterpriseInventory.update({
          where: { id: c.invRowId },
          data:  { quantity: newQty < 0.0001 ? 0 : newQty },
        });

        // ── Зарахування виторгу гравцю ─────────────────────────────────
        // Гравець отримує повний revenue (з ПДВ); TaxService щомісяця
        // обчислює зобов'язання з NPC_SALE-транзакцій і виставляє рахунок.
        const balanceBefore = balanceCache.get(c.playerId) ?? new Decimal(0);
        const balanceAfter  = balanceBefore.plus(revenue);
        balanceCache.set(c.playerId, balanceAfter);

        await this.prisma.player.update({
          where: { id: c.playerId },
          data:  { cashBalance: balanceAfter },
        });

        // ── Транзакційний запис ─────────────────────────────────────────
        await this.prisma.financialTransaction.create({
          data: {
            playerId:      c.playerId,
            type:          'NPC_SALE',
            amountUah:     revenue,                    // Decimal ✓
            balanceBefore,                             // Decimal ✓
            balanceAfter,                              // Decimal ✓
            description:
              `B2C роздріб [${city.nameUa}]: ${actualUnits.toFixed(2)} od. ` +
              `"${demand.product.nameUa}" @ ₴${c.retailPrice.toFixed(2)} ` +
              `| нетто ₴${netRevenue.toFixed(2)}, ПДВ ₴${vatAmount.toFixed(2)}`,
            referenceId: cityId,
          },
        });

        // ── Зведення по тіку ───────────────────────────────────────────
        summary.totalRevenueUah   = summary.totalRevenueUah.plus(revenue);
        summary.totalVatCollected = summary.totalVatCollected.plus(vatAmount);

        const existing = summary.storeResults.find(r => r.storeId === c.storeId);
        if (existing) {
          existing.unitsSold  += actualUnits;
          existing.revenueUah  = existing.revenueUah.plus(revenue);
          existing.vatUah      = existing.vatUah.plus(vatAmount);
        } else {
          summary.storeResults.push({
            storeId:    c.storeId,
            playerId:   c.playerId,
            unitsSold:  actualUnits,
            revenueUah: revenue,
            vatUah:     vatAmount,
          });
        }
      }

      if (candidates.length > 0) summary.totalProductsSold++;
    }

    return summary;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ДОПОМІЖНІ МЕТОДИ
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Скасовує відкритий SELL-ордер і повертає заморожені товари на склад.
   * Частково виконані ордери повертають тільки незаповнений залишок.
   */
  async cancelB2BOrder(orderId: string, playerId: string): Promise<void> {
    const order = await this.prisma.marketOrder.findUniqueOrThrow({ where: { id: orderId } });
    if (order.playerId !== playerId) throw new Error('Only the order owner can cancel it');
    if (order.status === 'FILLED' || order.status === 'CANCELLED') {
      throw new Error(`Order is already ${order.status}`);
    }

    const returnQty = order.quantityTotal - order.quantityFilled;
    if (returnQty < 0.001) {
      await this.prisma.marketOrder.update({
        where: { id: orderId },
        data:  { status: 'CANCELLED' },
      });
      return;
    }

    // Знаходимо будь-який операційний склад і повертаємо товар
    const warehouse = await this.prisma.enterprise.findFirst({
      where: { playerId, type: 'WAREHOUSE', isOperational: true },
      include: { inventory: { where: { productId: order.productId } } },
    });
    if (!warehouse) throw new Error('No operational WAREHOUSE to return goods to');

    const existingInv = warehouse.inventory[0];
    await this.prisma.$transaction([
      existingInv
        ? this.prisma.enterpriseInventory.update({
            where: { id: existingInv.id },
            data:  { quantity: existingInv.quantity + returnQty },
          })
        : this.prisma.enterpriseInventory.create({
            data: {
              enterpriseId: warehouse.id,
              productId:    order.productId,
              quantity:     returnQty,
              avgQuality:   order.quality ?? 7.0,
            },
          }),
      this.prisma.marketOrder.update({
        where: { id: orderId },
        data:  { status: 'CANCELLED' },
      }),
    ]);
  }
}
