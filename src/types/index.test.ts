import { describe, it, expect } from 'vitest';
import { clamp, weightedAvgQuality, decimalToNumber } from './index';
import { Decimal } from '@prisma/client/runtime/library';

describe('clamp', () => {
  it('returns the value when within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('clamps to the minimum', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it('clamps to the maximum', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });
});

describe('weightedAvgQuality', () => {
  it('returns 0 for an empty batch list', () => {
    expect(weightedAvgQuality([])).toBe(0);
  });

  it('returns the quality of a single batch unchanged', () => {
    expect(weightedAvgQuality([{ quantity: 10, quality: 7 }])).toBe(7);
  });

  it('weights batches by quantity', () => {
    // 10 units @ quality 10 blended with 10 units @ quality 0 → average 5
    expect(weightedAvgQuality([
      { quantity: 10, quality: 10 },
      { quantity: 10, quality: 0 },
    ])).toBe(5);
  });

  it('favors the larger batch', () => {
    // 90 units @ quality 10 + 10 units @ quality 0 → 9.0
    expect(weightedAvgQuality([
      { quantity: 90, quality: 10 },
      { quantity: 10, quality: 0 },
    ])).toBeCloseTo(9.0);
  });
});

describe('decimalToNumber', () => {
  it('passes plain numbers through', () => {
    expect(decimalToNumber(42)).toBe(42);
  });

  it('converts a Decimal to a number', () => {
    expect(decimalToNumber(new Decimal('123.45'))).toBeCloseTo(123.45);
  });
});
