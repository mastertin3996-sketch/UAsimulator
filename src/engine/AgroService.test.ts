import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { mockDeep, mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import { AgroService } from './AgroService';

const prismaMock = mockDeep<PrismaClient>() as unknown as DeepMockProxy<PrismaClient>;

beforeEach(() => {
  mockReset(prismaMock);
});

describe('AgroService.calcExtraFieldRent', () => {
  it('charges 8 UAH per m2, rounded', () => {
    expect(AgroService.calcExtraFieldRent(1000)).toBe(8000);
  });

  it('rounds fractional results', () => {
    expect(AgroService.calcExtraFieldRent(125)).toBe(Math.round(125 * 8));
  });

  it('returns 0 for zero area', () => {
    expect(AgroService.calcExtraFieldRent(0)).toBe(0);
  });
});

describe('AgroService.calcForwardCancelPenalty', () => {
  it('charges 5% of the contract value, rounded', () => {
    expect(AgroService.calcForwardCancelPenalty(1000, 20)).toBe(Math.round(1000 * 20 * 0.05));
  });

  it('scales with both quantity and price', () => {
    expect(AgroService.calcForwardCancelPenalty(500, 40)).toBe(Math.round(500 * 40 * 0.05));
  });

  it('returns 0 for a zero-quantity contract', () => {
    expect(AgroService.calcForwardCancelPenalty(0, 100)).toBe(0);
  });
});

describe('AgroService.processGrainMoisture (workshop-scoped GRAIN_SPECIALIST)', () => {
  const fieldRecipe = { recipe: { outputs: [{ product: { sku: 'RM-WHEAT' } }] } };

  function makeFarm() {
    return {
      id: 'farm-1',
      localWeatherMod: 1.0, // no rain bonus
      employees: [{ profession: 'GRAIN_SPECIALIST', workshopId: 'ws-1' }],
      workshops: [
        { id: 'ws-1', grainMoisturePct: 20, productionOrders: [fieldRecipe] },
        { id: 'ws-2', grainMoisturePct: 20, productionOrders: [fieldRecipe] },
      ],
    };
  }

  it('applies the specialist drying formula only to the workshop the specialist is assigned to', async () => {
    prismaMock.enterprise.findMany.mockResolvedValueOnce([makeFarm()] as never);
    prismaMock.workshop.update.mockResolvedValue({} as never);
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5); // neutralises jitter to 0

    const svc = new AgroService(prismaMock);
    await svc.processGrainMoisture(0n);

    // ws-1: has the specialist -> deterministic drying (current 20 - 0.5 dryRate = 19.5)
    expect(prismaMock.workshop.update).toHaveBeenCalledWith({
      where: { id: 'ws-1' },
      data:  { grainMoisturePct: 19.5 },
    });
    // ws-2: same enterprise, but specialist is assigned to ws-1 only -> falls back to
    // the standard weather formula (BASE_MOISTURE[0]=15 + rainBonus 0 + neutralised jitter 0)
    expect(prismaMock.workshop.update).toHaveBeenCalledWith({
      where: { id: 'ws-2' },
      data:  { grainMoisturePct: 15 },
    });

    randomSpy.mockRestore();
  });
});
