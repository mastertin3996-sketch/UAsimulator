import { describe, it, expect } from 'vitest';
import { AgroService } from './AgroService';

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
