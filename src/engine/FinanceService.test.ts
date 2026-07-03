import { describe, it, expect } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { FinanceService } from './FinanceService';

// calcMonthlyPayment/getRateForRating/getTermForAmount are private, pure (no-DB)
// methods — accessed via a cast for testing without changing their visibility
// in production code (same pattern used for LoanService.calcAnnualRate).
const svc = new FinanceService({} as PrismaClient) as unknown as {
  calcMonthlyPayment(principal: Decimal, annualRate: Decimal, termMonths: number): Decimal;
  getRateForRating(creditRating: number): Decimal;
  getTermForAmount(amountUah: number): number;
};

describe('FinanceService.getRateForRating', () => {
  it('gives the best rate to top-tier credit ratings', () => {
    expect(svc.getRateForRating(9.0).toString()).toBe('0.16');
    expect(svc.getRateForRating(8.0).toString()).toBe('0.16');
  });

  it('gives the worst rate to the lowest credit ratings', () => {
    expect(svc.getRateForRating(0.0).toString()).toBe('0.24');
    expect(svc.getRateForRating(1.5).toString()).toBe('0.24');
  });

  it('picks the correct middle tier', () => {
    expect(svc.getRateForRating(7.0).toString()).toBe('0.18');
    expect(svc.getRateForRating(5.0).toString()).toBe('0.2');
  });
});

describe('FinanceService.getTermForAmount', () => {
  it('gives the longest term to the largest loans', () => {
    expect(svc.getTermForAmount(3_000_000)).toBe(36);
  });

  it('gives a mid-length term to mid-size loans', () => {
    expect(svc.getTermForAmount(600_000)).toBe(24);
  });

  it('gives the shortest term to small loans', () => {
    expect(svc.getTermForAmount(50_000)).toBe(12);
  });
});

describe('FinanceService.calcMonthlyPayment', () => {
  it('computes a standard amortizing payment', () => {
    // ₴1,000,000 at 18%/yr over 24 months
    const payment = svc.calcMonthlyPayment(new Decimal(1_000_000), new Decimal('0.18'), 24);
    // Sanity: monthly payment should exceed principal/term (interest is charged)
    // and be well under the full principal.
    expect(payment.greaterThan(1_000_000 / 24)).toBe(true);
    expect(payment.lessThan(1_000_000)).toBe(true);
    // Known value for this amortization formula (verified via direct calculation)
    expect(payment.toNumber()).toBeCloseTo(49924.10, 1);
  });

  it('scales payment down for a longer term at the same rate', () => {
    const short = svc.calcMonthlyPayment(new Decimal(1_000_000), new Decimal('0.18'), 12);
    const long  = svc.calcMonthlyPayment(new Decimal(1_000_000), new Decimal('0.18'), 36);
    expect(long.lessThan(short)).toBe(true);
  });
});
