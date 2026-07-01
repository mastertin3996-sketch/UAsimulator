import { describe, it, expect } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { LoanService } from './LoanService';

// calcAnnualRate is a private, pure (no-DB) method — accessed via bracket
// notation for testing without changing its visibility in production code.
function annualRate(rating: number): number {
  const svc = new LoanService({} as PrismaClient);
  return (svc as unknown as { calcAnnualRate(r: number): number }).calcAnnualRate(rating);
}

describe('LoanService.calcAnnualRate', () => {
  it('returns the base rate at the neutral rating (5.0)', () => {
    expect(annualRate(5)).toBeCloseTo(0.26);
  });

  it('lowers the rate for better credit ratings', () => {
    expect(annualRate(10)).toBeCloseTo(0.16);
  });

  it('raises the rate for worse credit ratings', () => {
    expect(annualRate(3)).toBeCloseTo(0.30);
  });

  it('clamps to the maximum rate for very poor ratings', () => {
    expect(annualRate(0)).toBeCloseTo(0.32);
  });

  it('clamps to the minimum rate for very good ratings', () => {
    expect(annualRate(15)).toBeCloseTo(0.12);
  });
});
