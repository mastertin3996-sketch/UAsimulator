import { describe, it, expect } from 'vitest';
import { Decimal } from '@prisma/client/runtime/library';
import { calculateNpcPriceCorrection } from './StockExchangeService';

describe('calculateNpcPriceCorrection', () => {
  it('leaves the price unchanged when trading within the fair-value band', () => {
    // fundamental ₴10 per share (₴10,000,000 / 1,000,000 shares), price ₴10 → ratio 1.0
    const result = calculateNpcPriceCorrection(new Decimal(10), new Decimal(10_000_000), 1_000_000n);
    expect(result.npcCorrected).toBe(false);
    expect(result.newPrice.toString()).toBe('10');
  });

  it('nudges an undervalued price up toward the fundamental, capped at it', () => {
    // fundamental ₴10/share, market price ₴8 (ratio 0.8 < 0.85 threshold)
    const result = calculateNpcPriceCorrection(new Decimal(8), new Decimal(10_000_000), 1_000_000n);
    expect(result.npcCorrected).toBe(true);
    // +2% of 8 = 8.16, still below the ₴10 implied price so no cap applied
    expect(result.newPrice.toNumber()).toBeCloseTo(8.16, 5);
  });

  it('nudges an overvalued price down toward the fundamental, capped at it', () => {
    // fundamental ₴10/share, market price ₴13 (ratio 1.3 > 1.20 threshold)
    const result = calculateNpcPriceCorrection(new Decimal(13), new Decimal(10_000_000), 1_000_000n);
    expect(result.npcCorrected).toBe(true);
    // -2% of 13 = 12.74, still above the ₴10 implied price so no cap applied
    expect(result.newPrice.toNumber()).toBeCloseTo(12.74, 5);
  });

  it('caps the upward nudge at the implied fundamental price', () => {
    // Price so deeply undervalued that a 2% nudge would overshoot the fundamental
    const result = calculateNpcPriceCorrection(new Decimal(1), new Decimal(10_000_000), 1_000_000n);
    expect(result.newPrice.toNumber()).toBeLessThanOrEqual(10);
  });

  it('does not correct when there are no shares issued yet (avoids division by zero)', () => {
    const result = calculateNpcPriceCorrection(new Decimal(10), new Decimal(10_000_000), 0n);
    expect(result.npcCorrected).toBe(false);
    expect(result.newPrice.toString()).toBe('10');
  });
});
