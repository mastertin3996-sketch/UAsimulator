import { describe, it, expect, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { mockDeep, mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import { FoodProcessingService } from './FoodProcessingService';

const prismaMock = mockDeep<PrismaClient>() as unknown as DeepMockProxy<PrismaClient>;

beforeEach(() => { mockReset(prismaMock); });

function makeEnt(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ent-1',
    workshops: [{ equipment: [] as Array<{ isBroken: boolean; wearAndTear: number; catalogProduct: { sku: string } }> }],
    inventory: [
      { id: 'inv-milk',  avgQuality: 8.0, product: { sku: 'FG-MILK' } },   // perishable
      { id: 'inv-steel', avgQuality: 8.0, product: { sku: 'FG-STEEL-P' } }, // NOT perishable
    ],
    ...overrides,
  };
}

describe('FoodProcessingService.processPerishability', () => {
  it('lowers avgQuality of perishables when there is no cold chain, leaving non-perishables untouched', async () => {
    prismaMock.enterprise.findMany.mockResolvedValueOnce([makeEnt()] as never);
    prismaMock.$transaction.mockImplementation((arr: unknown) => Promise.all(arr as Promise<unknown>[]) as never);
    prismaMock.enterpriseInventory.update.mockResolvedValue({} as never);

    const svc = new FoodProcessingService(prismaMock);
    await svc.processPerishability();

    // Only the perishable milk row is updated (steel untouched)
    expect(prismaMock.enterpriseInventory.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.enterpriseInventory.update).toHaveBeenCalledWith({
      where: { id: 'inv-milk' },
      data:  { avgQuality: 8.0 - FoodProcessingService.DECAY_PER_TICK },
    });
  });

  it('skips degradation entirely when an operational cold-chain unit is installed', async () => {
    const ent = makeEnt({
      workshops: [{ equipment: [{ isBroken: false, wearAndTear: 0, catalogProduct: { sku: 'EQ-REFRIGERATOR-IND' } }] }],
    });
    prismaMock.enterprise.findMany.mockResolvedValueOnce([ent] as never);

    const svc = new FoodProcessingService(prismaMock);
    await svc.processPerishability();

    expect(prismaMock.enterpriseInventory.update).not.toHaveBeenCalled();
  });

  it('a broken cold-chain unit does NOT protect (degradation still applies)', async () => {
    const ent = makeEnt({
      workshops: [{ equipment: [{ isBroken: true, wearAndTear: 1.0, catalogProduct: { sku: 'EQ-REFRIGERATOR-IND' } }] }],
    });
    prismaMock.enterprise.findMany.mockResolvedValueOnce([ent] as never);
    prismaMock.$transaction.mockImplementation((arr: unknown) => Promise.all(arr as Promise<unknown>[]) as never);
    prismaMock.enterpriseInventory.update.mockResolvedValue({} as never);

    const svc = new FoodProcessingService(prismaMock);
    await svc.processPerishability();

    expect(prismaMock.enterpriseInventory.update).toHaveBeenCalledTimes(1);
  });

  it('respects the quality floor (never drops below QUALITY_FLOOR)', async () => {
    const ent = makeEnt({
      inventory: [{ id: 'inv-milk', avgQuality: FoodProcessingService.QUALITY_FLOOR, product: { sku: 'FG-MILK' } }],
    });
    prismaMock.enterprise.findMany.mockResolvedValueOnce([ent] as never);

    const svc = new FoodProcessingService(prismaMock);
    await svc.processPerishability();

    // Already at floor → nothing to update
    expect(prismaMock.enterpriseInventory.update).not.toHaveBeenCalled();
  });
});
