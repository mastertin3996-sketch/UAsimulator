/**
 * TEST SUITE 3 — B2B ACID / Concurrency (Race Condition Prevention)
 *
 * Тестує механіку CAS (Compare-And-Swap) у EconomyService.executeB2BTrade.
 *
 * Сценарій «подвійний продаж»:
 *   Ордер: 100 одиниць хліба за ₴50/шт
 *   Покупець A намагається купити 80 одиниць.
 *   Покупець B одночасно намагається купити 80 одиниць.
 *   Разом: 160 одиниць з 100 — неможливо без клонування ресурсу.
 *
 * Правильна поведінка:
 *   – Перший updateMany (CAS) → count=1 → угода виконана
 *   – Другий updateMany (WHERE quantityFilled ≤ 20) → count=0 → помилка → rollback
 *   – Жодного дублювання товару або балансу
 *
 * Сценарій «недостатньо коштів під час угоди»:
 *   Між кроком 3 (читання балансу) і кроком 4 (CAS списання) паралельна транзакція
 *   витратила кошти → cashBalance updateMany → count=0 → весь процес відкочується,
 *   включно з резервацією кількості ордеру (крок 2).
 */

import { PrismaClient, MarketOrderStatus } from '@prisma/client';
import { Decimal }                          from '@prisma/client/runtime/library';
import { EconomyService }                   from '../services/EconomyService';
import { createMockPrisma, resetMockPrisma } from './helpers/mockPrisma';

// ── Ідентифікатори ──────────────────────────────────────────────────────────

const SELLER_ID  = 'player-seller-0000-0000-000000000001';
const BUYER_A_ID = 'player-buyer-a-000-0000-000000000001';
const BUYER_B_ID = 'player-buyer-b-000-0000-000000000001';
const ORDER_ID   = 'order-00000000-0000-0000-0000-000000000001';
const PRODUCT_ID = 'product-00000000-0000-0000-0000-000000000001';
const WAREHOUSE_SELLER_ID = 'ent-warehouse-seller-000000000001';
const WAREHOUSE_BUYER_ID  = 'ent-warehouse-buyer-0000000000001';

// ── Фікстури ─────────────────────────────────────────────────────────────────

const PRICE_PER_UNIT = new Decimal('50');
const ORDER_TOTAL    = 100;

function makeOrder(overrides: {
  quantityFilled?: number;
  status?: MarketOrderStatus;
  expiresAt?: Date;
} = {}) {
  return {
    id:             ORDER_ID,
    playerId:       SELLER_ID,
    productId:      PRODUCT_ID,
    resourceType:   'FG-BREAD',
    type:           'SELL' as const,
    status:         overrides.status ?? ('OPEN' as MarketOrderStatus),
    pricePerUnit:   PRICE_PER_UNIT,
    qualityMin:     null,
    quality:        7.5,
    quantityTotal:  ORDER_TOTAL,
    quantityFilled: overrides.quantityFilled ?? 0,
    expiresAt:      overrides.expiresAt ?? new Date(Date.now() + 30 * 24 * 3600 * 1000),
    createdAt:      new Date(),
    filledAt:       null,
  };
}

function makePlayer(id: string, balance: number) {
  return {
    id,
    email:          `${id}@example.com`,
    username:       id,
    passwordHash:   'x',
    companyName:    'Test Co',
    cashBalance:    new Decimal(balance.toString()),
    netWorth:       new Decimal(balance.toString()),
    creditRating:   7.0,
    reputationScore: 5.0,
    createdAt:      new Date(),
    lastActiveAt:   new Date(),
  };
}

const mockWarehouseSeller = {
  id:            WAREHOUSE_SELLER_ID,
  playerId:      SELLER_ID,
  type:          'WAREHOUSE',
  isOperational: true,
  landPlot:      { cityId: 'city-kyiv' },
  inventory:     [],
};

const mockWarehouseBuyer = {
  id:            WAREHOUSE_BUYER_ID,
  playerId:      BUYER_A_ID,
  type:          'WAREHOUSE',
  isOperational: true,
  landPlot:      { cityId: 'city-kyiv' },
  inventory:     [],  // порожньо → create буде викликано
};

// ── Тести ────────────────────────────────────────────────────────────────────

describe('EconomyService.executeB2BTrade — ACID / CAS anti-duplication', () => {
  let mock: ReturnType<typeof createMockPrisma>;
  let svc:  EconomyService;

  beforeEach(() => {
    mock = createMockPrisma();
    svc  = new EconomyService(mock as unknown as PrismaClient);
  });

  afterEach(() => {
    resetMockPrisma(mock);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Сценарій 1: CAS успішно блокує другу угоду (double-sell prevention)
  // ══════════════════════════════════════════════════════════════════════════

  it('allows first buyer and rejects second via atomic CAS (count=0)', async () => {
    // ── Угода A: 80 одиниць — УСПІХ ─────────────────────────────────────
    const orderInitial     = makeOrder({ quantityFilled: 0 });
    const orderAfterA      = makeOrder({ quantityFilled: 80, status: 'PARTIALLY_FILLED' });
    const sellerPlayer     = makePlayer(SELLER_ID, 10_000);
    const buyerAPlayer     = makePlayer(BUYER_A_ID, 20_000);  // ₴20 000 = 80 × ₴50 + запас

    mock.marketOrder.findUnique.mockResolvedValueOnce(orderInitial);
    mock.marketOrder.updateMany.mockResolvedValueOnce({ count: 1 });      // CAS-резервація → успіх
    mock.player.findUniqueOrThrow
      .mockResolvedValueOnce(buyerAPlayer)                                // читання балансу
      .mockResolvedValueOnce(sellerPlayer);                               // зарахування продавцю
    mock.player.updateMany.mockResolvedValueOnce({ count: 1 });           // CAS-списання → успіх
    mock.player.update.mockResolvedValueOnce({});                         // зарахування продавцю
    mock.marketOrder.findUniqueOrThrow.mockResolvedValueOnce(orderAfterA); // перечитання статусу
    mock.marketOrder.update.mockResolvedValueOnce({});                    // оновлення статусу
    mock.enterprise.findFirst.mockResolvedValueOnce(mockWarehouseSeller); // склад продавця
    mock.enterprise.findFirst.mockResolvedValueOnce(mockWarehouseBuyer);  // склад покупця A
    mock.enterpriseInventory.findUnique.mockResolvedValueOnce(null);      // немає existing → create
    mock.enterpriseInventory.create.mockResolvedValueOnce({ id: 'inv-1' });
    mock.financialTransaction.createMany.mockResolvedValueOnce({ count: 2 });

    const receiptA = await svc.executeB2BTrade(BUYER_A_ID, ORDER_ID, 80);
    expect(receiptA.quantityFilled).toBe(80);
    expect(receiptA.grossCostUah.toNumber()).toBe(4_000);   // 80 × ₴50
    expect(receiptA.bankFeeUah.toNumber()).toBe(40);         // 1%
    expect(receiptA.sellerNetUah.toNumber()).toBe(3_960);    // 4000 − 40

    // Перевіряємо, що товар зарахований один раз
    expect(mock.enterpriseInventory.create).toHaveBeenCalledTimes(1);

    // ── Скидання між угодами ──────────────────────────────────────────────
    resetMockPrisma(mock);

    // ── Угода B: ще 80 одиниць тих самих — має ВІДХИЛИТИСЯ ──────────────
    // Покупець B бачить ордер із тим самим станом (прочитав одночасно з A),
    // але CAS повертає count=0 (PostgreSQL вже побачив quantityFilled=80 від A).
    const buyerBPlayer = makePlayer(BUYER_B_ID, 20_000);

    mock.marketOrder.findUnique.mockResolvedValueOnce(orderInitial);     // бачить "старий" стан
    mock.marketOrder.updateMany.mockResolvedValueOnce({ count: 0 });      // ← CAS ПРОВАЛЮЄТЬСЯ
    mock.marketOrder.findUnique.mockResolvedValueOnce(orderAfterA);       // перечитання для повідомлення

    await expect(
      svc.executeB2BTrade(BUYER_B_ID, ORDER_ID, 80),
    ).rejects.toThrow(/Concurrent conflict|remain/i);

    // Жодного зарахування товару або грошей покупцю B
    expect(mock.enterpriseInventory.create).not.toHaveBeenCalled();
    expect(mock.enterpriseInventory.update).not.toHaveBeenCalled();
    expect(mock.player.updateMany).not.toHaveBeenCalled();  // не дійшло до CAS-списання
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Сценарій 2: Insufficient funds discovered mid-transaction via CAS
  // ══════════════════════════════════════════════════════════════════════════

  it('rolls back quantity reservation when buyer balance is drained mid-transaction', async () => {
    // Між кроком 3 (читання balanceBefore) і кроком 4 (updateMany cashBalance)
    // інша транзакція витратила кошти. cashBalance.updateMany → count=0 → rollback.

    const orderInitial = makeOrder({ quantityFilled: 0 });
    // Покупець "думає", що має ₴10 000, але реальний залишок впав до ₴100 після читання
    const buyerPlayer  = makePlayer(BUYER_A_ID, 10_000);  // stale read

    mock.marketOrder.findUnique.mockResolvedValueOnce(orderInitial);
    mock.marketOrder.updateMany.mockResolvedValueOnce({ count: 1 });     // крок 2: кількість зарезервована
    mock.player.findUniqueOrThrow.mockResolvedValueOnce(buyerPlayer);    // крок 3: читання балансу (stale)
    mock.player.updateMany.mockResolvedValueOnce({ count: 0 });          // крок 4: CAS → баланс змінився!

    await expect(
      svc.executeB2BTrade(BUYER_A_ID, ORDER_ID, 80),
    ).rejects.toThrow(/Insufficient funds|rolled back/i);

    // Після rollback: продавець не отримав кошти, товар не переданий
    expect(mock.player.update).not.toHaveBeenCalled();       // кредит продавцю — не відбувся
    expect(mock.enterpriseInventory.create).not.toHaveBeenCalled();
    expect(mock.enterpriseInventory.update).not.toHaveBeenCalled();
    expect(mock.financialTransaction.createMany).not.toHaveBeenCalled();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Сценарій 3: Замовлення вже скасовано/заповнено → чітке повідомлення
  // ══════════════════════════════════════════════════════════════════════════

  it('reports specific error when order is FILLED before buyer claims it', async () => {
    const orderInitial = makeOrder({ quantityFilled: 0 });
    const orderFilled  = makeOrder({ quantityFilled: 100, status: 'FILLED' });

    mock.marketOrder.findUnique
      .mockResolvedValueOnce(orderInitial)  // перше читання (стейл)
      .mockResolvedValueOnce(orderFilled);  // перечитання після count=0

    mock.marketOrder.updateMany.mockResolvedValueOnce({ count: 0 });

    let errorMessage = '';
    try {
      await svc.executeB2BTrade(BUYER_A_ID, ORDER_ID, 50);
    } catch (err) {
      errorMessage = (err as Error).message;
    }

    expect(errorMessage).toMatch(/fully sold out|FILLED/i);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Сценарій 4: Успішна угода — перевірка receipt і банківської комісії
  // ══════════════════════════════════════════════════════════════════════════

  it('computes correct receipt values: bankFee=1%, sellerNet=grossCost-fee', async () => {
    const purchaseQty  = 50;
    const grossCost    = PRICE_PER_UNIT.times(purchaseQty);     // 50 × ₴50 = ₴2 500
    const expectedFee  = grossCost.times('0.01');               // ₴25
    const expectedNet  = grossCost.minus(expectedFee);          // ₴2 475

    const orderInitial  = makeOrder({ quantityFilled: 0 });
    const orderRefreshed = makeOrder({ quantityFilled: 50, status: 'PARTIALLY_FILLED' });
    const buyerPlayer   = makePlayer(BUYER_A_ID, 10_000);
    const sellerPlayer  = makePlayer(SELLER_ID, 5_000);

    mock.marketOrder.findUnique.mockResolvedValueOnce(orderInitial);
    mock.marketOrder.updateMany.mockResolvedValueOnce({ count: 1 });
    mock.player.findUniqueOrThrow
      .mockResolvedValueOnce(buyerPlayer)
      .mockResolvedValueOnce(sellerPlayer);
    mock.player.updateMany.mockResolvedValueOnce({ count: 1 });
    mock.player.update.mockResolvedValueOnce({});
    mock.marketOrder.findUniqueOrThrow.mockResolvedValueOnce(orderRefreshed);
    mock.marketOrder.update.mockResolvedValueOnce({});
    mock.enterprise.findFirst.mockResolvedValueOnce(mockWarehouseSeller);
    mock.enterprise.findFirst.mockResolvedValueOnce(mockWarehouseBuyer);
    mock.enterpriseInventory.findUnique.mockResolvedValueOnce(null);
    mock.enterpriseInventory.create.mockResolvedValueOnce({ id: 'inv-2' });
    mock.financialTransaction.createMany.mockResolvedValueOnce({ count: 2 });

    const receipt = await svc.executeB2BTrade(BUYER_A_ID, ORDER_ID, purchaseQty);

    expect(receipt.grossCostUah.toNumber()).toBe(grossCost.toNumber());   // ₴2 500
    expect(receipt.bankFeeUah.toNumber()).toBe(expectedFee.toNumber());   // ₴25
    expect(receipt.sellerNetUah.toNumber()).toBe(expectedNet.toNumber()); // ₴2 475
    expect(receipt.quantityFilled).toBe(purchaseQty);
    expect(receipt.orderStatus).toBe('PARTIALLY_FILLED');  // 50/100 → частково
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Сценарій 5: Спроба купити у самого себе → відмова без DB-запитів
  // ══════════════════════════════════════════════════════════════════════════

  it('rejects self-trade without writing to DB', async () => {
    const selfSellOrder = makeOrder();
    // Продавець і покупець — одна особа
    mock.marketOrder.findUnique.mockResolvedValueOnce({
      ...selfSellOrder,
      playerId: BUYER_A_ID,   // ← продавець = покупець
    });

    await expect(
      svc.executeB2BTrade(BUYER_A_ID, ORDER_ID, 10),
    ).rejects.toThrow(/yourself/i);

    expect(mock.marketOrder.updateMany).not.toHaveBeenCalled();
    expect(mock.player.updateMany).not.toHaveBeenCalled();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Сценарій 6: Рівночасне тестування через Promise.allSettled
  // Симулює реальну конкурентну ситуацію, де обидва читання відбуваються
  // до будь-якого запису (race window at its worst)
  // ══════════════════════════════════════════════════════════════════════════

  it('exactly one of two concurrent 80-unit bids succeeds (race window simulation)', async () => {
    // Обидва покупці бачать ОДНАКОВИЙ стан ордеру (quantityFilled=0)
    // і обидва надсилають запит "куплю 80"
    const orderInitial   = makeOrder({ quantityFilled: 0 });
    const orderPartial   = makeOrder({ quantityFilled: 80, status: 'PARTIALLY_FILLED' });
    const buyerAPlayer   = makePlayer(BUYER_A_ID, 20_000);
    const buyerBPlayer   = makePlayer(BUYER_B_ID, 20_000);
    const sellerPlayer   = makePlayer(SELLER_ID,   0);

    // Мок для А: усе успішно
    const mockForA = {
      findUnique:        orderInitial,
      updateMany_order:  { count: 1 },    // A отримує кількість
      findUniqueOrThrow: [buyerAPlayer, sellerPlayer, orderPartial],
      updateMany_player: { count: 1 },    // A списує кошти
    };

    // Мок для B: updateMany ордеру → count=0 (A вже забрав залишок)
    const mockForB = {
      findUnique:       orderInitial,    // бачить "старий" стан
      updateMany_order: { count: 0 },   // CAS провалюється
      findUnique2:      orderPartial,   // перечитання для опису помилки
    };

    // Налаштовуємо мок послідовно
    mock.marketOrder.findUnique
      .mockResolvedValueOnce(mockForA.findUnique)  // A
      .mockResolvedValueOnce(mockForB.findUnique)  // B
      .mockResolvedValueOnce(mockForB.findUnique2); // B (перечитання після count=0)

    mock.marketOrder.updateMany
      .mockResolvedValueOnce(mockForA.updateMany_order)  // A's CAS → success
      .mockResolvedValueOnce(mockForB.updateMany_order); // B's CAS → fail

    mock.player.findUniqueOrThrow
      .mockResolvedValueOnce(buyerAPlayer)
      .mockResolvedValueOnce(sellerPlayer);

    mock.player.updateMany
      .mockResolvedValueOnce(mockForA.updateMany_player);

    mock.player.update.mockResolvedValueOnce({});

    mock.marketOrder.findUniqueOrThrow.mockResolvedValueOnce(orderPartial);
    mock.marketOrder.update.mockResolvedValueOnce({});
    mock.enterprise.findFirst
      .mockResolvedValueOnce(mockWarehouseSeller)
      .mockResolvedValueOnce(mockWarehouseBuyer);
    mock.enterpriseInventory.findUnique.mockResolvedValueOnce(null);
    mock.enterpriseInventory.create.mockResolvedValueOnce({ id: 'inv-race-1' });
    mock.financialTransaction.createMany.mockResolvedValueOnce({ count: 2 });

    const [aResult, bResult] = await Promise.allSettled([
      svc.executeB2BTrade(BUYER_A_ID, ORDER_ID, 80),
      svc.executeB2BTrade(BUYER_B_ID, ORDER_ID, 80),
    ]);

    // Рівно один успіх, один провал
    const successes = [aResult, bResult].filter(r => r.status === 'fulfilled').length;
    const failures  = [aResult, bResult].filter(r => r.status === 'rejected').length;

    expect(successes).toBe(1);
    expect(failures).toBe(1);

    // Товар зарахований рівно один раз (не клонований)
    expect(mock.enterpriseInventory.create).toHaveBeenCalledTimes(1);
  });
});
