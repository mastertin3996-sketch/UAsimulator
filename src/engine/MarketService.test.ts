import { describe, it, expect, beforeEach, type Mock } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { mockDeep, mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import { MarketService } from './MarketService';

const prismaMock = mockDeep<PrismaClient>() as unknown as DeepMockProxy<PrismaClient>;

beforeEach(() => {
  mockReset(prismaMock);
});

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    playerId: 'player-1',
    productId: 'product-1',
    type: 'SELL',
    status: 'OPEN',
    pricePerUnit: new Decimal(100),
    quality: 7,
    qualityMin: null,
    quantityTotal: 10,
    quantityFilled: 0,
    isStateOrder: false,
    createdAt: new Date('2026-01-01'),
    expiresAt: new Date('2026-12-31'),
    ...overrides,
  };
}

function makePlayer(overrides: Record<string, unknown> = {}) {
  return {
    id: 'player-1',
    cashBalance: new Decimal(1_000_000),
    isAccreditedSupplier: false,
    reputationScore: 5,
    ...overrides,
  };
}

describe('MarketService.matchOrders', () => {
  it('returns no trades when there are no sell orders', async () => {
    prismaMock.marketOrder.findMany.mockResolvedValueOnce([] as never); // sells
    const svc = new MarketService(prismaMock);
    const trades = await svc.matchOrders();
    expect(trades).toEqual([]);
  });

  it('returns no trades when there are no buy orders', async () => {
    prismaMock.marketOrder.findMany
      .mockResolvedValueOnce([makeOrder({ type: 'SELL' })] as never) // sells
      .mockResolvedValueOnce([] as never); // buys
    const svc = new MarketService(prismaMock);
    const trades = await svc.matchOrders();
    expect(trades).toEqual([]);
  });

  it('does not match a sell priced above the best buy', async () => {
    const sell = makeOrder({ id: 'sell-1', playerId: 'seller', type: 'SELL', pricePerUnit: new Decimal(150) });
    const buy  = makeOrder({ id: 'buy-1', playerId: 'buyer', type: 'BUY', pricePerUnit: new Decimal(100) });
    prismaMock.marketOrder.findMany
      .mockResolvedValueOnce([sell] as never)
      .mockResolvedValueOnce([buy] as never);
    const svc = new MarketService(prismaMock);
    const trades = await svc.matchOrders();
    expect(trades).toEqual([]);
  });

  it('skips a match between the same player (no self-trading)', async () => {
    const sell = makeOrder({ id: 'sell-1', playerId: 'same-player', type: 'SELL', pricePerUnit: new Decimal(100) });
    const buy  = makeOrder({ id: 'buy-1', playerId: 'same-player', type: 'BUY', pricePerUnit: new Decimal(100) });
    prismaMock.marketOrder.findMany
      .mockResolvedValueOnce([sell] as never)
      .mockResolvedValueOnce([buy] as never);
    const svc = new MarketService(prismaMock);
    const trades = await svc.matchOrders();
    expect(trades).toEqual([]);
  });

  it('skips a buy order whose qualityMin exceeds the sell order quality', async () => {
    const sell = makeOrder({ id: 'sell-1', playerId: 'seller', type: 'SELL', pricePerUnit: new Decimal(100), quality: 4 });
    const buy  = makeOrder({ id: 'buy-1', playerId: 'buyer', type: 'BUY', pricePerUnit: new Decimal(100), qualityMin: 8 });
    prismaMock.marketOrder.findMany
      .mockResolvedValueOnce([sell] as never)
      .mockResolvedValueOnce([buy] as never);
    const svc = new MarketService(prismaMock);
    const trades = await svc.matchOrders();
    expect(trades).toEqual([]);
  });

  it('skips a buyer who cannot afford the trade (insufficient cash balance)', async () => {
    const sell = makeOrder({ id: 'sell-1', playerId: 'seller', type: 'SELL', pricePerUnit: new Decimal(100), quantityTotal: 10 });
    const buy  = makeOrder({ id: 'buy-1', playerId: 'buyer', type: 'BUY', pricePerUnit: new Decimal(100), quantityTotal: 10 });
    prismaMock.marketOrder.findMany
      .mockResolvedValueOnce([sell] as never)
      .mockResolvedValueOnce([buy] as never);
    prismaMock.player.findFirst.mockResolvedValue(null as never); // no derzhprom player
    prismaMock.player.findUniqueOrThrow.mockResolvedValue(makePlayer({ id: 'buyer', cashBalance: new Decimal(1) }) as never);

    const svc = new MarketService(prismaMock);
    const trades = await svc.matchOrders();
    expect(trades).toEqual([]);
  });

  it('executes a full trade when price, quality and funds all line up', async () => {
    const sell = makeOrder({ id: 'sell-1', playerId: 'seller', type: 'SELL', pricePerUnit: new Decimal(100), quantityTotal: 10, quality: 7 });
    const buy  = makeOrder({ id: 'buy-1', playerId: 'buyer', type: 'BUY', pricePerUnit: new Decimal(100), quantityTotal: 10 });

    prismaMock.marketOrder.findMany
      .mockResolvedValueOnce([sell] as never)   // sells
      .mockResolvedValueOnce([buy] as never);   // buys
    prismaMock.player.findFirst.mockResolvedValue(null as never); // no derzhprom player configured
    prismaMock.player.findUniqueOrThrow.mockResolvedValue(makePlayer({ id: 'buyer', cashBalance: new Decimal(1_000_000) }) as never);
    prismaMock.playerInventory.findUnique.mockResolvedValue({ playerId: 'seller', productId: 'product-1', quantity: 10, avgQuality: 7 } as never);

    // $transaction receives our callback and should run it against the same mock client
    prismaMock.$transaction.mockImplementation((fn: unknown) => (fn as (tx: unknown) => unknown)(prismaMock) as never);

    prismaMock.marketOrder.update.mockResolvedValue({} as never);
    prismaMock.marketTrade.create.mockResolvedValue({} as never);
    prismaMock.player.update.mockResolvedValue({} as never);
    prismaMock.playerInventory.update.mockResolvedValue({} as never);
    prismaMock.playerInventory.create.mockResolvedValue({} as never);
    prismaMock.financialTransaction.create.mockResolvedValue({} as never);
    prismaMock.product.findMany.mockResolvedValue([] as never);
    prismaMock.notification.create.mockResolvedValue({} as never);

    const svc = new MarketService(prismaMock);
    const trades = await svc.matchOrders();

    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({
      sellOrderId: 'sell-1',
      buyOrderId: 'buy-1',
      quantity: 10,
      sellerRevenue: 1000,
      buyerCost: 1000,
      sellerPlayerId: 'seller',
      buyerPlayerId: 'buyer',
    });

    // Both orders should be marked FILLED (fully matched, 10 for 10)
    expect(prismaMock.marketOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'sell-1' }, data: expect.objectContaining({ status: 'FILLED' }) }),
    );
    expect(prismaMock.marketOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'buy-1' }, data: expect.objectContaining({ status: 'FILLED' }) }),
    );
    expect(prismaMock.marketTrade.create).toHaveBeenCalledTimes(1);
  });
});

describe('MarketService.updateNpcMarketPrices', () => {
  it('clamps a chronically-undersupplied referencePrice to 1.4x the base price', async () => {
    prismaMock.player.findFirst.mockResolvedValue(null as never); // no derzhprom configured
    // groupBy has heavily-overloaded typing that mockDeep can't expose mock methods on — cast to Mock.
    (prismaMock.npcDemand.groupBy as unknown as Mock).mockResolvedValueOnce([
      { productId: 'bread-id', _sum: { baseUnitsPerDay: 6211 }, _avg: { referencePrice: new Decimal(1597.80) } },
    ]);
    (prismaMock.marketOrder.groupBy as unknown as Mock).mockResolvedValueOnce([
      { productId: 'bread-id', _sum: { quantityTotal: 400 } }, // fillRatio ~0.064 -> deficit -> upward drift
    ]);
    prismaMock.product.findMany.mockResolvedValueOnce([{ id: 'bread-id', sku: 'FG-BREAD' }] as never);
    prismaMock.npcDemand.updateMany.mockResolvedValue({} as never);
    prismaMock.$transaction.mockImplementation((arr: unknown) => Promise.all(arr as Promise<unknown>[]) as never);

    const svc = new MarketService(prismaMock);
    await svc.updateNpcMarketPrices(0n);

    // Base price for FG-BREAD is 32 -> ceiling 32 * 1.4 = 44.8, regardless of how far
    // the deficit-driven drift would otherwise have pushed the reference price.
    expect(prismaMock.npcDemand.updateMany).toHaveBeenCalledWith({
      where: { productId: 'bread-id' },
      data:  { referencePrice: 44.8 },
    });
  });
});
