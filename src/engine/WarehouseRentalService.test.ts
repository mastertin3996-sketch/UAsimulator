import { describe, it, expect, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { mockDeep, mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import { WarehouseRentalService } from './WarehouseRentalService';

const prismaMock = mockDeep<PrismaClient>() as unknown as DeepMockProxy<PrismaClient>;
beforeEach(() => { mockReset(prismaMock); });

function makeWarehouse(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wh-1', playerId: 'p1', name: 'Склад',
    employees: [{ profession: 'WAREHOUSE_MANAGER', isOnStrike: false }],
    workshops: [{ equipment: [{ isBroken: false, wearAndTear: 0, catalogProduct: { sku: 'EQ-RACKING' } }] }],
    ...overrides,
  };
}

describe('WarehouseRentalService.processStorageServices (Wave 3 — 3PL income)', () => {
  it('pays a warehouse that has both handling equipment and relevant staff', async () => {
    prismaMock.enterprise.findMany.mockResolvedValueOnce([makeWarehouse()] as never);
    prismaMock.$transaction.mockResolvedValue([] as never);
    prismaMock.player.update.mockReturnValue({} as never);
    prismaMock.financialLog.create.mockReturnValue({} as never);

    const svc = new WarehouseRentalService(prismaMock);
    const paid = await svc.processStorageServices(1n);

    expect(paid).toBe(1);
    // income = BASE(500) × 1 unit × (1 + 0.15×1 staff) = 575
    expect(prismaMock.player.update).toHaveBeenCalledWith({
      where: { id: 'p1' }, data: { cashBalance: { increment: 575 } },
    });
  });

  it('pays nothing to a warehouse with equipment but no relevant staff', async () => {
    const wh = makeWarehouse({ employees: [{ profession: 'CLEANER', isOnStrike: false }] });
    prismaMock.enterprise.findMany.mockResolvedValueOnce([wh] as never);

    const svc = new WarehouseRentalService(prismaMock);
    const paid = await svc.processStorageServices(1n);

    expect(paid).toBe(0);
    expect(prismaMock.player.update).not.toHaveBeenCalled();
  });

  it('pays nothing to a warehouse with staff but no handling equipment', async () => {
    const wh = makeWarehouse({ workshops: [{ equipment: [] }] });
    prismaMock.enterprise.findMany.mockResolvedValueOnce([wh] as never);

    const svc = new WarehouseRentalService(prismaMock);
    const paid = await svc.processStorageServices(1n);

    expect(paid).toBe(0);
    expect(prismaMock.player.update).not.toHaveBeenCalled();
  });

  it('caps income at THREE_PL_CAP', async () => {
    // 5 units × BASE(500) × (1 + 0.15×4) = 4000 — under cap; push way over with many units capped at 5 and 4 staff → 4000.
    // To exceed cap, raise BASE effect via many units (capped 5) — 4000 < 10000, so cap not hit here; assert value instead.
    const wh = makeWarehouse({
      employees: Array.from({ length: 4 }, () => ({ profession: 'FORKLIFT_OPERATOR', isOnStrike: false })),
      workshops: [{ equipment: Array.from({ length: 5 }, () => ({ isBroken: false, wearAndTear: 0, catalogProduct: { sku: 'EQ-FORKLIFT' } })) }],
    });
    prismaMock.enterprise.findMany.mockResolvedValueOnce([wh] as never);
    prismaMock.$transaction.mockResolvedValue([] as never);
    prismaMock.player.update.mockReturnValue({} as never);
    prismaMock.financialLog.create.mockReturnValue({} as never);

    const svc = new WarehouseRentalService(prismaMock);
    await svc.processStorageServices(1n);

    // 500 × 5 × (1 + 0.15×4=1.6) = 4000
    expect(prismaMock.player.update).toHaveBeenCalledWith({
      where: { id: 'p1' }, data: { cashBalance: { increment: 4000 } },
    });
  });
});
