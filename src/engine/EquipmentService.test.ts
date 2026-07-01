import { describe, it, expect } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { EquipmentService } from './EquipmentService';

const svc = new EquipmentService({} as PrismaClient);

describe('EquipmentService.workshopEquipmentFactor', () => {
  it('returns 0 for a workshop with no equipment', () => {
    expect(svc.workshopEquipmentFactor([])).toBe(0);
  });

  it('returns 1 for a single brand-new, fully operational unit', () => {
    expect(svc.workshopEquipmentFactor([
      { status: 'OPERATIONAL' as never, wearAndTear: 0, isBroken: false },
    ])).toBe(1);
  });

  it('ignores broken equipment entirely (contributes 0, not negative)', () => {
    const factor = svc.workshopEquipmentFactor([
      { status: 'OPERATIONAL' as never, wearAndTear: 0, isBroken: false },
      { status: 'BROKEN' as never, wearAndTear: 1, isBroken: true },
    ]);
    // one healthy unit (1.0) + one broken unit (0) averaged over 2 units
    expect(factor).toBeCloseTo(0.5);
  });

  it('applies a 50% penalty to WORN equipment', () => {
    const factor = svc.workshopEquipmentFactor([
      { status: 'WORN' as never, wearAndTear: 0.2, isBroken: false },
    ]);
    // healthFactor = 1 - 0.2 = 0.8, WORN halves it → 0.4
    expect(factor).toBeCloseTo(0.4);
  });
});

describe('EquipmentService.workshopQualityFactor', () => {
  it('scales the equipment factor to a 0-10 range', () => {
    expect(svc.workshopQualityFactor([
      { status: 'OPERATIONAL' as never, wearAndTear: 0, isBroken: false },
    ])).toBeCloseTo(10);
  });
});
