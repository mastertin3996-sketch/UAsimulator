import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { mockDeep, mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import { LogisticsFreightService } from './LogisticsFreightService';

const prismaMock = mockDeep<PrismaClient>() as unknown as DeepMockProxy<PrismaClient>;
beforeEach(() => { mockReset(prismaMock); });

const near = { id: 'c-near', latitude: 50.0, longitude: 30.0 };
const far  = { id: 'c-far',  latitude: 46.4, longitude: 30.7 }; // ~3.6° південніше

describe('LogisticsFreightService.generateNpcOrders — distance tariff (Wave 4)', () => {
  it('charges a higher tariff for a longer route', async () => {
    const created: Array<{ tariffPerUnit: Decimal }> = [];
    prismaMock.logisticsFreightOrder.create.mockImplementation((args: unknown) => {
      created.push((args as { data: { tariffPerUnit: Decimal } }).data);
      return {} as never;
    });
    prismaMock.logisticsFreightOrder.updateMany.mockResolvedValue({} as never);
    // Force a deterministic sequence: random() = 0 → 1 order (3 + floor(0*3)), same city order, no rand noise.
    vi.spyOn(Math, 'random').mockReturnValue(0);

    // Run A: two near cities (small distance)
    prismaMock.city.findMany.mockResolvedValueOnce([near, { ...near, id: 'c-near2' }] as never);
    await new LogisticsFreightService(prismaMock).generateNpcOrders(1n);
    const tariffNear = Number(created.at(-1)!.tariffPerUnit);

    // Run B: near + far (large distance)
    created.length = 0;
    prismaMock.city.findMany.mockResolvedValueOnce([near, far] as never);
    await new LogisticsFreightService(prismaMock).generateNpcOrders(1n);
    const tariffFar = Number(created.at(-1)!.tariffPerUnit);

    vi.restoreAllMocks();
    expect(tariffFar).toBeGreaterThan(tariffNear);
  });
});

describe('LogisticsFreightService.acceptOrder — fleet/driver bonus (Wave 4)', () => {
  function stubAccept(
    hubEquipmentSkus: string[],
    drivers: number,
    hubCount = 1,
    extraStaff: Record<string, number> = {},
  ) {
    prismaMock.logisticsFreightOrder.findFirst.mockResolvedValue({
      id: 'ord-1', status: 'OPEN', productSku: 'CM-CEMENT', totalValueUah: new Decimal(1000),
    } as never);
    const employees = [
      ...Array.from({ length: drivers }, () => ({ profession: 'DRIVER', isOnStrike: false })),
      ...Object.entries(extraStaff).flatMap(([profession, count]) =>
        Array.from({ length: count }, () => ({ profession, isOnStrike: false }))),
    ];
    prismaMock.enterprise.findFirst.mockResolvedValue({
      id: 'hub-1',
      employees,
      workshops: [{ equipment: hubEquipmentSkus.map(sku => ({ isBroken: false, wearAndTear: 0, catalogProduct: { sku } })) }],
    } as never);
    prismaMock.enterprise.count.mockResolvedValue(hubCount as never);
    prismaMock.logisticsFreightOrder.update.mockResolvedValue({} as never);
  }

  it('a bare single hub (no fleet, no drivers) earns exactly the order value — no regression', async () => {
    stubAccept([], 0, 1);
    const res = await new LogisticsFreightService(prismaMock).acceptOrder('ord-1', 'p1', 10n);
    expect(res.revenueUah).toBe(1000); // bonusMult = 1.0
  });

  it('a heavy-truck hub carrying heavy cargo earns a premium above the bare hub', async () => {
    stubAccept(['EQ-TRUCK-HEAVY'], 2, 1); // hasTruck +0.10, heavy+HEAVY_TRUCK +0.15, 2 drivers +0.06 → 1.31
    const res = await new LogisticsFreightService(prismaMock).acceptOrder('ord-1', 'p1', 10n);
    expect(res.revenueUah).toBeCloseTo(1310, 0);
  });

  it('preserves the existing 2+ hub floor (never below ×1.20)', async () => {
    stubAccept([], 0, 2); // hubCount 2 → 1.20 floor, no fleet
    const res = await new LogisticsFreightService(prismaMock).acceptOrder('ord-1', 'p1', 10n);
    expect(res.revenueUah).toBeCloseTo(1200, 0);
  });

  it('MECHANIC headcount adds a small capped bonus (fewer fleet breakdowns)', async () => {
    stubAccept([], 0, 1, { MECHANIC: 2 }); // 2 mechanics → +0.02*2 = +0.04 → 1.04
    const res = await new LogisticsFreightService(prismaMock).acceptOrder('ord-1', 'p1', 10n);
    expect(res.revenueUah).toBeCloseTo(1040, 0);
  });

  it('MECHANIC bonus is gated at 2 headcount (extra mechanics give no further bonus)', async () => {
    stubAccept([], 0, 1, { MECHANIC: 5 }); // gated at 2 → same as 2 mechanics
    const res = await new LogisticsFreightService(prismaMock).acceptOrder('ord-1', 'p1', 10n);
    expect(res.revenueUah).toBeCloseTo(1040, 0);
  });

  it('LOGISTICIAN headcount adds a distinct route-efficiency bonus', async () => {
    stubAccept([], 0, 1, { LOGISTICIAN: 3 }); // 3 logisticians → +0.025*3 = +0.075 → 1.075
    const res = await new LogisticsFreightService(prismaMock).acceptOrder('ord-1', 'p1', 10n);
    expect(res.revenueUah).toBeCloseTo(1075, 0);
  });

  it('LOGISTICIAN bonus is gated at 3 headcount', async () => {
    stubAccept([], 0, 1, { LOGISTICIAN: 6 }); // gated at 3 → same as 3 logisticians
    const res = await new LogisticsFreightService(prismaMock).acceptOrder('ord-1', 'p1', 10n);
    expect(res.revenueUah).toBeCloseTo(1075, 0);
  });

  it('MECHANIC and LOGISTICIAN bonuses stack with DRIVER/DISPATCHER and fleet bonuses', async () => {
    stubAccept(['EQ-TRUCK-HEAVY'], 2, 1, { MECHANIC: 2, LOGISTICIAN: 3 });
    // hasTruck +0.10, heavy+HEAVY_TRUCK +0.15, 2 drivers +0.06, mechanics +0.04, logisticians +0.075 → 1.425
    const res = await new LogisticsFreightService(prismaMock).acceptOrder('ord-1', 'p1', 10n);
    expect(res.revenueUah).toBeCloseTo(1425, 0);
  });
});
