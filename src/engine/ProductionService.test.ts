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

  const employee = { isOnStrike: false, efficiency: 1.0, mood: 1.0, profession: 'CASHIER', workshopId: 'ws-1' };
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

  it('produces nothing when the only employee is unassigned (workshopId null)', async () => {
    stubGlobalLookups();
    const ent = makeEnterprise({ employees: [{ ...employee, workshopId: null }] });
    prismaMock.enterprise.findMany
      .mockResolvedValueOnce([ent] as never)
      .mockResolvedValueOnce([] as never);

    const svc = new ProductionService(prismaMock);
    const { results } = await svc.processProduction('player-1');

    expect(results).toHaveLength(0);
  });

  it('only the workshop with assigned staff produces, in a 2-workshop enterprise', async () => {
    stubGlobalLookups();
    const base = makeEnterprise();
    const ws1 = base.workshops[0]; // has productionOrders, staffed via `employee` fixture (workshopId 'ws-1')
    const ws2 = {
      ...ws1,
      id: 'ws-2',
      productionOrders: [{ ...ws1.productionOrders[0], id: 'order-2' }],
    };
    const ent = makeEnterprise({ workshops: [ws1, ws2] });
    prismaMock.enterprise.findMany
      .mockResolvedValueOnce([ent] as never)
      .mockResolvedValueOnce([] as never);
    prismaMock.enterpriseInventory.update.mockResolvedValue({} as never);
    prismaMock.enterpriseInventory.create.mockResolvedValue({} as never);
    prismaMock.productionOrder.update.mockResolvedValue({} as never);

    const svc = new ProductionService(prismaMock);
    const { results, utilisationByWorkshop } = await svc.processProduction('player-1');

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ workshopId: 'ws-1' });
    expect(utilisationByWorkshop.get('ws-1')).toBeGreaterThan(0);
    expect(utilisationByWorkshop.get('ws-2')).toBe(0);
  });
});

describe('ProductionService FOOD_PROCESSING bonuses (Wave 1)', () => {
  function stubGlobalLookups(eqSkus: Array<{ id: string; sku: string }> = []) {
    prismaMock.product.findFirst.mockResolvedValue(null as never);
    prismaMock.macroEvent.findMany.mockResolvedValue([] as never);
    prismaMock.license.findMany.mockResolvedValue([] as never);
    prismaMock.product.findMany.mockResolvedValue(eqSkus as never); // EQ-* catalog → productIdToSku
  }

  // Build a FOOD_PROCESSING enterprise producing `outputSku`, with `count` employees of `profession`,
  // and one equipment unit whose catalogProductId is `eqProductId`.
  function makeFood(outputSku: string, profession: string, count: number, eqProductId = 'eq-generic') {
    const employees = Array.from({ length: count }, (_, i) => ({
      isOnStrike: false, efficiency: 1.0, mood: 1.0, profession, workshopId: 'ws-1', id: `emp-${i}`,
    }));
    return {
      id: 'ent-1', type: 'FOOD_PROCESSING', employees,
      landPlot: null, extraFieldAreaM2: 0, localWeatherMod: 1.0,
      inventory: [{ id: 'inv-input', productId: 'input-1', quantity: 1000, avgQuality: 6 }],
      farmMachinery: [], livestockHerds: [],
      workshops: [{
        id: 'ws-1', footprintM2: 100, maxCapacity: 20, currentVolume: 0, plantedSeasonTick: null,
        equipment: [{ status: 'NEW', wearAndTear: 0, isBroken: false, catalogProductId: eqProductId }],
        productionOrders: [{
          id: 'order-1', targetQuantity: 1000, completedQuantity: 0, ticksRemaining: 10,
          recipe: {
            id: 'recipe-1', powerKwhPerUnit: 1,
            inputs: [{ productId: 'input-1', quantityPerUnit: 1 }],
            outputs: [{ quantityPerUnit: 1, product: { sku: outputSku, nameUa: 'X' } }],
          },
        }],
      }],
    };
  }

  async function runUnits(ent: ReturnType<typeof makeFood>, eqSkus: Array<{ id: string; sku: string }> = []) {
    stubGlobalLookups(eqSkus);
    prismaMock.enterprise.findMany.mockResolvedValueOnce([ent] as never).mockResolvedValueOnce([] as never);
    prismaMock.enterpriseInventory.update.mockResolvedValue({} as never);
    prismaMock.enterpriseInventory.create.mockResolvedValue({} as never);
    prismaMock.productionOrder.update.mockResolvedValue({} as never);
    const svc = new ProductionService(prismaMock);
    const { results } = await svc.processProduction('player-1');
    return results[0]?.unitsProduced ?? 0;
  }

  it('BAKER boosts a baked SKU by ~5%/person (×1.15 at 3) vs same-headcount non-baker', async () => {
    const withBakers   = await runUnits(makeFood('FG-BREAD', 'BAKER', 3));
    const withOperators = await runUnits(makeFood('FG-BREAD', 'OPERATOR', 3));
    expect(withOperators).toBeGreaterThan(0);
    expect(withBakers / withOperators).toBeCloseTo(1.15, 2);
  });

  it('BAKER does NOT boost a non-baked (mill) SKU — cross-family isolation', async () => {
    const bakerMilling    = await runUnits(makeFood('SF-FLOUR', 'BAKER', 3));
    const operatorMilling = await runUnits(makeFood('SF-FLOUR', 'OPERATOR', 3));
    expect(operatorMilling).toBeGreaterThan(0);
    expect(bakerMilling / operatorMilling).toBeCloseTo(1.0, 2);
  });

  it('EQ-BAKELINE multiplies a baked SKU by 1.25 vs equal-health non-bakeline equipment', async () => {
    const eqMap = [{ id: 'eq-bakeline', sku: 'EQ-BAKELINE' }, { id: 'eq-furnace', sku: 'EQ-FURNACE' }];
    const withBakeline = await runUnits(makeFood('FG-BREAD', 'OPERATOR', 3, 'eq-bakeline'), eqMap);
    const withFurnace  = await runUnits(makeFood('FG-BREAD', 'OPERATOR', 3, 'eq-furnace'),  eqMap);
    expect(withFurnace).toBeGreaterThan(0);
    expect(withBakeline / withFurnace).toBeCloseTo(1.25, 2);
  });
});

describe('ProductionService TEXTILE_FACTORY bonuses (Wave 2)', () => {
  function stubGlobalLookups(eqSkus: Array<{ id: string; sku: string }> = []) {
    prismaMock.product.findFirst.mockResolvedValue(null as never);
    prismaMock.macroEvent.findMany.mockResolvedValue([] as never);
    prismaMock.license.findMany.mockResolvedValue([] as never);
    prismaMock.product.findMany.mockResolvedValue(eqSkus as never);
  }
  // TEXTILE_FACTORY minStaff=4, minWorkshopAreaM2=100 → 4 employees, footprint 150.
  function makeTextile(outputSku: string, profession: string, count: number, eqProductId = 'eq-generic') {
    const employees = Array.from({ length: count }, (_, i) => ({
      isOnStrike: false, efficiency: 1.0, mood: 1.0, profession, workshopId: 'ws-1', id: `emp-${i}`,
    }));
    return {
      id: 'ent-1', type: 'TEXTILE_FACTORY', employees,
      landPlot: null, extraFieldAreaM2: 0, localWeatherMod: 1.0,
      inventory: [{ id: 'inv-input', productId: 'input-1', quantity: 100000, avgQuality: 6 }],
      farmMachinery: [], livestockHerds: [],
      workshops: [{
        id: 'ws-1', footprintM2: 150, maxCapacity: 20, currentVolume: 0, plantedSeasonTick: null,
        equipment: [{ status: 'NEW', wearAndTear: 0, isBroken: false, catalogProductId: eqProductId }],
        productionOrders: [{
          id: 'order-1', targetQuantity: 100000, completedQuantity: 0, ticksRemaining: 10,
          recipe: { id: 'recipe-1', powerKwhPerUnit: 1,
            inputs: [{ productId: 'input-1', quantityPerUnit: 1 }],
            outputs: [{ quantityPerUnit: 1, product: { sku: outputSku, nameUa: 'X' } }] },
        }],
      }],
    };
  }
  async function runUnits(ent: ReturnType<typeof makeTextile>, eqSkus: Array<{ id: string; sku: string }> = []) {
    stubGlobalLookups(eqSkus);
    prismaMock.enterprise.findMany.mockResolvedValueOnce([ent] as never).mockResolvedValueOnce([] as never);
    prismaMock.enterpriseInventory.update.mockResolvedValue({} as never);
    prismaMock.enterpriseInventory.create.mockResolvedValue({} as never);
    prismaMock.productionOrder.update.mockResolvedValue({} as never);
    const svc = new ProductionService(prismaMock);
    const { results } = await svc.processProduction('player-1');
    return results[0]?.unitsProduced ?? 0;
  }

  it('SPINNER boosts a fabric SKU (×1.15 at 3+) vs same-headcount operators', async () => {
    const withSpinners  = await runUnits(makeTextile('SF-LINEN', 'SPINNER', 4));
    const withOperators = await runUnits(makeTextile('SF-LINEN', 'OPERATOR', 4));
    expect(withOperators).toBeGreaterThan(0);
    expect(withSpinners / withOperators).toBeCloseTo(1.15, 2);
  });

  it('SPINNER does NOT boost a garment SKU (cross-family isolation)', async () => {
    const spinnerGarment  = await runUnits(makeTextile('FG-JEANS', 'SPINNER', 4));
    const operatorGarment = await runUnits(makeTextile('FG-JEANS', 'OPERATOR', 4));
    expect(operatorGarment).toBeGreaterThan(0);
    expect(spinnerGarment / operatorGarment).toBeCloseTo(1.0, 2);
  });

  it('EQ-LOOM multiplies a fabric SKU by 1.20 vs equal-health non-loom equipment', async () => {
    const eqMap = [{ id: 'eq-loom', sku: 'EQ-LOOM' }, { id: 'eq-furnace', sku: 'EQ-FURNACE' }];
    const withLoom    = await runUnits(makeTextile('SF-LINEN', 'OPERATOR', 4, 'eq-loom'), eqMap);
    const withFurnace = await runUnits(makeTextile('SF-LINEN', 'OPERATOR', 4, 'eq-furnace'), eqMap);
    expect(withFurnace).toBeGreaterThan(0);
    expect(withLoom / withFurnace).toBeCloseTo(1.20, 2);
  });
});

describe('ProductionService HEAVY_INDUSTRY bonuses', () => {
  function stubGlobalLookups(eqSkus: Array<{ id: string; sku: string }> = []) {
    prismaMock.product.findFirst.mockResolvedValue(null as never);
    prismaMock.macroEvent.findMany.mockResolvedValue([] as never);
    prismaMock.license.findMany.mockResolvedValue([] as never);
    prismaMock.product.findMany.mockResolvedValue(eqSkus as never);
  }
  // HEAVY_INDUSTRY minStaff=3, minWorkshopAreaM2=120 → 3 employees, footprint 150.
  function makeHeavy(outputSku: string, profession: string, count: number, eqProductId = 'eq-generic') {
    const employees = Array.from({ length: count }, (_, i) => ({
      isOnStrike: false, efficiency: 1.0, mood: 1.0, profession, workshopId: 'ws-1', id: `emp-${i}`,
    }));
    return {
      id: 'ent-1', type: 'HEAVY_INDUSTRY', employees,
      landPlot: null, extraFieldAreaM2: 0, localWeatherMod: 1.0,
      inventory: [{ id: 'inv-input', productId: 'input-1', quantity: 100000, avgQuality: 6 }],
      farmMachinery: [], livestockHerds: [],
      workshops: [{
        id: 'ws-1', footprintM2: 150, maxCapacity: 20, currentVolume: 0, plantedSeasonTick: null,
        equipment: [{ status: 'NEW', wearAndTear: 0, isBroken: false, catalogProductId: eqProductId }],
        productionOrders: [{
          id: 'order-1', targetQuantity: 100000, completedQuantity: 0, ticksRemaining: 10,
          recipe: { id: 'recipe-1', powerKwhPerUnit: 1,
            inputs: [{ productId: 'input-1', quantityPerUnit: 1 }],
            outputs: [{ quantityPerUnit: 1, product: { sku: outputSku, nameUa: 'X' } }] },
        }],
      }],
    };
  }
  async function runUnits(ent: ReturnType<typeof makeHeavy>, eqSkus: Array<{ id: string; sku: string }> = []) {
    stubGlobalLookups(eqSkus);
    prismaMock.enterprise.findMany.mockResolvedValueOnce([ent] as never).mockResolvedValueOnce([] as never);
    prismaMock.enterpriseInventory.update.mockResolvedValue({} as never);
    prismaMock.enterpriseInventory.create.mockResolvedValue({} as never);
    prismaMock.productionOrder.update.mockResolvedValue({} as never);
    const svc = new ProductionService(prismaMock);
    const { results } = await svc.processProduction('player-1');
    return results[0]?.unitsProduced ?? 0;
  }

  it('a bare workshop (no STEELWORKER/CARPENTER, no specialised equipment) produces exactly like maxCapacity — no regression', async () => {
    const withOperators = await runUnits(makeHeavy('SF-STEEL', 'OPERATOR', 3));
    expect(withOperators).toBeGreaterThan(0);
  });

  it('STEELWORKER boosts a steel SKU (×1.15 at 3+) vs same-headcount operators', async () => {
    const withSteelworkers = await runUnits(makeHeavy('SF-STEEL', 'STEELWORKER', 3));
    const withOperators    = await runUnits(makeHeavy('SF-STEEL', 'OPERATOR', 3));
    expect(withOperators).toBeGreaterThan(0);
    expect(withSteelworkers / withOperators).toBeCloseTo(1.15, 2);
  });

  it('STEELWORKER does NOT boost a wood SKU (cross-family isolation)', async () => {
    const steelworkerWood = await runUnits(makeHeavy('FG-FURN', 'STEELWORKER', 3));
    const operatorWood    = await runUnits(makeHeavy('FG-FURN', 'OPERATOR', 3));
    expect(operatorWood).toBeGreaterThan(0);
    expect(steelworkerWood / operatorWood).toBeCloseTo(1.0, 2);
  });

  it('CARPENTER boosts a wood SKU (×1.15 at 3+) vs same-headcount operators', async () => {
    const withCarpenters = await runUnits(makeHeavy('SF-PLANKS', 'CARPENTER', 3));
    const withOperators  = await runUnits(makeHeavy('SF-PLANKS', 'OPERATOR', 3));
    expect(withOperators).toBeGreaterThan(0);
    expect(withCarpenters / withOperators).toBeCloseTo(1.15, 2);
  });

  it('EQ-BLASTFURNACE multiplies a steel SKU by 1.20 vs equal-health non-blastfurnace equipment', async () => {
    const eqMap = [{ id: 'eq-blast', sku: 'EQ-BLASTFURNACE' }, { id: 'eq-furnace', sku: 'EQ-FURNACE' }];
    const withBlast   = await runUnits(makeHeavy('SF-STEEL', 'OPERATOR', 3, 'eq-blast'), eqMap);
    const withFurnace = await runUnits(makeHeavy('SF-STEEL', 'OPERATOR', 3, 'eq-furnace'), eqMap);
    expect(withFurnace).toBeGreaterThan(0);
    expect(withBlast / withFurnace).toBeCloseTo(1.20, 2);
  });

  it('EQ-WOODPLANER multiplies a wood SKU by 1.20 vs equal-health non-woodplaner equipment', async () => {
    const eqMap = [{ id: 'eq-planer', sku: 'EQ-WOODPLANER' }, { id: 'eq-sawmill', sku: 'EQ-SAWMILL' }];
    const withPlaner  = await runUnits(makeHeavy('SF-PLANKS', 'OPERATOR', 3, 'eq-planer'), eqMap);
    const withSawmill = await runUnits(makeHeavy('SF-PLANKS', 'OPERATOR', 3, 'eq-sawmill'), eqMap);
    expect(withSawmill).toBeGreaterThan(0);
    expect(withPlaner / withSawmill).toBeCloseTo(1.20, 2);
  });

  // ── Signature mechanic: raw-material quality (RM-IRONORE/RM-COAL/RM-LUMBER) → outputQuality ──
  describe('raw-material input-quality bonus (heavyInputBonus)', () => {
    // equipQuality=5 (wear 0.5) and moodFactor=5 (mood 0.5) deliberately leave headroom below the
    // 0-10 clamp ceiling so the bonus is observable instead of being swallowed by saturation.
    function makeHeavyRawInput(rawSku: string, rawQuality: number, outputSku = 'SF-STEEL') {
      const employees = Array.from({ length: 3 }, (_, i) => ({
        isOnStrike: false, efficiency: 1.0, mood: 0.5, profession: 'OPERATOR', workshopId: 'ws-1', id: `emp-${i}`,
      }));
      return {
        id: 'ent-1', type: 'HEAVY_INDUSTRY', employees,
        landPlot: null, extraFieldAreaM2: 0, localWeatherMod: 1.0,
        inventory: [{ id: 'inv-raw', productId: 'raw-1', quantity: 100000, avgQuality: rawQuality }],
        farmMachinery: [], livestockHerds: [],
        workshops: [{
          id: 'ws-1', footprintM2: 150, maxCapacity: 20, currentVolume: 0, plantedSeasonTick: null,
          equipment: [{ status: 'NEW', wearAndTear: 0.5, isBroken: false, catalogProductId: 'eq-generic' }],
          productionOrders: [{
            id: 'order-1', targetQuantity: 100000, completedQuantity: 0, ticksRemaining: 10,
            recipe: { id: 'recipe-1', powerKwhPerUnit: 1,
              inputs: [{ productId: 'raw-1', quantityPerUnit: 1, product: { sku: rawSku } }],
              outputs: [{ quantityPerUnit: 1, product: { sku: outputSku, nameUa: 'X' } }] },
          }],
        }],
      };
    }
    async function runOutputQuality(ent: ReturnType<typeof makeHeavyRawInput>) {
      stubGlobalLookups();
      prismaMock.enterprise.findMany.mockResolvedValueOnce([ent] as never).mockResolvedValueOnce([] as never);
      prismaMock.enterpriseInventory.update.mockResolvedValue({} as never);
      prismaMock.enterpriseInventory.create.mockResolvedValue({} as never);
      prismaMock.productionOrder.update.mockResolvedValue({} as never);
      const svc = new ProductionService(prismaMock);
      const { results } = await svc.processProduction('player-1');
      return results[0]?.outputQuality ?? -1;
    }

    it('default/typical raw-material quality (≤ market baseline of 7) adds zero bonus — no regression', async () => {
      const atBaseline = await runOutputQuality(makeHeavyRawInput('RM-IRONORE', 7, 'SF-STEEL'));
      const belowBaseline = await runOutputQuality(makeHeavyRawInput('RM-IRONORE', 6, 'SF-STEEL'));
      // outputQuality = 0.40*equipQuality(5) + 0.30*moodFactor(5) + 0.30*inputQualityFactor(=rawQuality, only input)
      expect(atBaseline).toBeCloseTo(0.40 * 5 + 0.30 * 5 + 0.30 * 7, 5);   // 5.6, heavyInputBonus = 0
      expect(belowBaseline).toBeCloseTo(0.40 * 5 + 0.30 * 5 + 0.30 * 6, 5); // 5.3, heavyInputBonus = 0
    });

    it('missing/absent raw-material inventory row (avgQuality falls back to 5) also adds zero bonus', async () => {
      const ent = makeHeavyRawInput('RM-COAL', 5, 'SF-STEEL');
      ent.inventory[0].avgQuality = 5;
      const quality = await runOutputQuality(ent);
      expect(quality).toBeCloseTo(0.40 * 5 + 0.30 * 5 + 0.30 * 5, 5); // 5.0, heavyInputBonus = 0
    });

    it('high-quality RM-IRONORE/RM-COAL (above the 7.0 baseline) measurably raises outputQuality', async () => {
      const atBaseline  = await runOutputQuality(makeHeavyRawInput('RM-IRONORE', 7, 'SF-STEEL'));
      const highQuality = await runOutputQuality(makeHeavyRawInput('RM-IRONORE', 10, 'SF-STEEL'));
      expect(highQuality).toBeGreaterThan(atBaseline);
      // inputQualityFactor rises 7→10 (+0.3*3=0.9) plus heavyInputBonus (10-7)*0.3=0.9 → total +1.8
      expect(highQuality - atBaseline).toBeCloseTo(1.8, 5);
    });

    it('high-quality RM-LUMBER also feeds the bonus for wood-family outputs', async () => {
      const atBaseline  = await runOutputQuality(makeHeavyRawInput('RM-LUMBER', 7, 'SF-PLANKS'));
      const highQuality = await runOutputQuality(makeHeavyRawInput('RM-LUMBER', 10, 'SF-PLANKS'));
      expect(highQuality).toBeGreaterThan(atBaseline);
      expect(highQuality - atBaseline).toBeCloseTo(1.8, 5);
    });

    it('a non-tracked SKU never triggers the bonus, even at maximum quality (opt-in scoping)', async () => {
      const untracked = await runOutputQuality(makeHeavyRawInput('RM-SOMETHINGELSE', 10, 'SF-STEEL'));
      expect(untracked).toBeCloseTo(0.40 * 5 + 0.30 * 5 + 0.30 * 10, 5); // 6.5, heavyInputBonus = 0
    });
  });
});
