import { describe, it, expect, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { mockDeep, mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import { ProductionService } from './ProductionService';

const prismaMock = mockDeep<PrismaClient>() as unknown as DeepMockProxy<PrismaClient>;

beforeEach(() => {
  mockReset(prismaMock);
});

describe('ProductionService.createProductionOrder', () => {
  const baseWorkshop = {
    id: 'ws-1',
    isActive: true,
    maxCapacity: 100,
    enterpriseId: 'ent-1',
    enterprise: {
      id: 'ent-1',
      playerId: 'player-1',
      type: 'RETAIL_STORE',
      landPlot: { cityId: 'city-1' },
    },
  };
  const baseRecipe = {
    id: 'recipe-1',
    enterpriseType: 'RETAIL_STORE',
    ticksToComplete: 5,
    inputs: [{ productId: 'input-1', quantityPerUnit: 2 }],
    outputs: [{ productId: 'output-1', quantityPerUnit: 1 }],
  };

  it('rejects a caller who does not own the workshop', async () => {
    prismaMock.workshop.findUniqueOrThrow.mockResolvedValue(baseWorkshop as never);

    const svc = new ProductionService(prismaMock);
    await expect(svc.createProductionOrder('someone-else', 'ws-1', 'recipe-1', 10))
      .rejects.toThrow('Not owner');
  });

  it('rejects placing an order on an inactive workshop', async () => {
    prismaMock.workshop.findUniqueOrThrow.mockResolvedValue({ ...baseWorkshop, isActive: false } as never);

    const svc = new ProductionService(prismaMock);
    await expect(svc.createProductionOrder('player-1', 'ws-1', 'recipe-1', 10))
      .rejects.toThrow('Workshop is not active');
  });

  it('rejects a recipe meant for a different enterprise type', async () => {
    prismaMock.workshop.findUniqueOrThrow.mockResolvedValue(baseWorkshop as never);
    prismaMock.recipe.findUniqueOrThrow.mockResolvedValue({ ...baseRecipe, enterpriseType: 'AGRO_FARM' } as never);

    const svc = new ProductionService(prismaMock);
    await expect(svc.createProductionOrder('player-1', 'ws-1', 'recipe-1', 10))
      .rejects.toThrow(/requires AGRO_FARM/);
  });

  it('rejects when the city has no operational office', async () => {
    prismaMock.workshop.findUniqueOrThrow.mockResolvedValue(baseWorkshop as never);
    prismaMock.recipe.findUniqueOrThrow.mockResolvedValue(baseRecipe as never);
    prismaMock.office.findUnique.mockResolvedValue(null as never);

    const svc = new ProductionService(prismaMock);
    await expect(svc.createProductionOrder('player-1', 'ws-1', 'recipe-1', 10))
      .rejects.toThrow(/No operational office/);
  });

  it('rejects when there is not enough input inventory for a full run', async () => {
    prismaMock.workshop.findUniqueOrThrow.mockResolvedValue(baseWorkshop as never);
    prismaMock.recipe.findUniqueOrThrow.mockResolvedValue(baseRecipe as never);
    prismaMock.office.findUnique.mockResolvedValue({ isOperational: true } as never);
    prismaMock.enterpriseInventory.findUnique.mockResolvedValue({ quantity: 5 } as never); // need 2*10=20

    const svc = new ProductionService(prismaMock);
    await expect(svc.createProductionOrder('player-1', 'ws-1', 'recipe-1', 10))
      .rejects.toThrow(/Insufficient/);
  });

  it('creates the order with ticksRequired scaled to target quantity vs workshop capacity', async () => {
    prismaMock.workshop.findUniqueOrThrow.mockResolvedValue(baseWorkshop as never);
    prismaMock.recipe.findUniqueOrThrow.mockResolvedValue(baseRecipe as never);
    prismaMock.office.findUnique.mockResolvedValue({ isOperational: true } as never);
    prismaMock.enterpriseInventory.findUnique.mockResolvedValue({ quantity: 1000 } as never);
    prismaMock.productionOrder.create.mockResolvedValue({ id: 'order-1' } as never);

    const svc = new ProductionService(prismaMock);
    // targetQuantity 250, maxCapacity 100 -> ceil(250/100) = 3 runs * 5 ticksToComplete = 15
    const orderId = await svc.createProductionOrder('player-1', 'ws-1', 'recipe-1', 250);

    expect(orderId).toBe('order-1');
    expect(prismaMock.productionOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ticksRemaining: 15, targetQuantity: 250 }) }),
    );
  });
});

describe('ProductionService.processProduction', () => {
  function stubGlobalLookups() {
    // AG-FERTILIZER / EQ-IRRIGATION / SF-COMPOST / RM-SUNFL lookups — none present for a non-agro test
    prismaMock.product.findFirst.mockResolvedValue(null as never);
    prismaMock.macroEvent.findMany.mockResolvedValue([] as never);
    prismaMock.license.findMany.mockResolvedValue([] as never);
    prismaMock.product.findMany.mockResolvedValue([] as never); // EQ-* catalog
  }

  const employee = { isOnStrike: false, efficiency: 1.0, mood: 1.0, profession: 'CASHIER' };
  const equipment = { status: 'NEW', wearAndTear: 0, isBroken: false, catalogProductId: 'eq-1' };

  function makeEnterprise(overrides: Record<string, unknown> = {}) {
    return {
      id: 'ent-1',
      type: 'RETAIL_STORE',
      employees: [employee],
      landPlot: null,
      extraFieldAreaM2: 0,
      localWeatherMod: 1.0,
      inventory: [{ id: 'inv-input', productId: 'input-1', quantity: 100, avgQuality: 6 }],
      farmMachinery: [],
      livestockHerds: [],
      workshops: [{
        id: 'ws-1',
        footprintM2: 50,
        maxCapacity: 20,
        currentVolume: 0,
        plantedSeasonTick: null,
        equipment: [equipment],
        productionOrders: [{
          id: 'order-1',
          targetQuantity: 100,
          completedQuantity: 0,
          ticksRemaining: 10,
          recipe: {
            id: 'recipe-1',
            powerKwhPerUnit: 1,
            inputs: [{ productId: 'input-1', quantityPerUnit: 1 }],
            outputs: [{ quantityPerUnit: 1, product: { sku: 'FG-ITEM', nameUa: 'Товар' } }],
          },
        }],
      }],
      ...overrides,
    };
  }

  it('produces output and consumes input for a simple non-agro workshop', async () => {
    stubGlobalLookups();
    prismaMock.enterprise.findMany
      .mockResolvedValueOnce([makeEnterprise()] as never)  // main query
      .mockResolvedValueOnce([] as never);                  // intercropping (AGRO_FARM only)
    prismaMock.enterpriseInventory.update.mockResolvedValue({} as never);
    prismaMock.enterpriseInventory.create.mockResolvedValue({} as never);
    prismaMock.productionOrder.update.mockResolvedValue({} as never);

    const svc = new ProductionService(prismaMock);
    const { results, utilisationByWorkshop } = await svc.processProduction('player-1');

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ enterpriseId: 'ent-1', workshopId: 'ws-1', orderId: 'order-1' });
    expect(results[0].unitsProduced).toBeGreaterThan(0);
    expect(results[0].outputQuality).toBeGreaterThanOrEqual(0);
    expect(results[0].outputQuality).toBeLessThanOrEqual(10);
    expect(utilisationByWorkshop.get('ws-1')).toBeGreaterThan(0);

    // Input got consumed
    expect(prismaMock.enterpriseInventory.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'inv-input' } }),
    );
  });

  it('produces nothing when the workshop has no active production orders', async () => {
    stubGlobalLookups();
    const ent = makeEnterprise({ workshops: [{ ...makeEnterprise().workshops[0], productionOrders: [] }] });
    prismaMock.enterprise.findMany
      .mockResolvedValueOnce([ent] as never)
      .mockResolvedValueOnce([] as never);

    const svc = new ProductionService(prismaMock);
    const { results, utilisationByWorkshop } = await svc.processProduction('player-1');

    expect(results).toHaveLength(0);
    expect(utilisationByWorkshop.get('ws-1')).toBe(0);
  });

  it('does not produce when there is insufficient input inventory', async () => {
    stubGlobalLookups();
    const ent = makeEnterprise({ inventory: [{ id: 'inv-input', productId: 'input-1', quantity: 0, avgQuality: 6 }] });
    prismaMock.enterprise.findMany
      .mockResolvedValueOnce([ent] as never)
      .mockResolvedValueOnce([] as never);
    prismaMock.productionOrder.update.mockResolvedValue({} as never);

    const svc = new ProductionService(prismaMock);
    const { results } = await svc.processProduction('player-1');

    expect(results).toHaveLength(0);
    expect(prismaMock.enterpriseInventory.update).not.toHaveBeenCalled();
  });

  it('produces nothing for a workshop with no staff (labour efficiency is zero)', async () => {
    stubGlobalLookups();
    const ent = makeEnterprise({ employees: [] });
    prismaMock.enterprise.findMany
      .mockResolvedValueOnce([ent] as never)
      .mockResolvedValueOnce([] as never);

    const svc = new ProductionService(prismaMock);
    const { results } = await svc.processProduction('player-1');

    expect(results).toHaveLength(0);
  });
});
