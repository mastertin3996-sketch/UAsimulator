import { describe, it, expect } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { HRService } from './HRService';

const svc = new HRService({} as PrismaClient);

describe('HRService.workshopLabourEfficiency', () => {
  it('returns 0 for an empty roster', () => {
    expect(svc.workshopLabourEfficiency([])).toBe(0);
  });

  it('returns 0 when every employee is on strike', () => {
    expect(svc.workshopLabourEfficiency([
      { isOnStrike: true, efficiency: 1.0 },
    ])).toBe(0);
  });

  it('averages efficiency across active (non-striking) employees', () => {
    expect(svc.workshopLabourEfficiency([
      { isOnStrike: false, efficiency: 1.0 },
      { isOnStrike: false, efficiency: 0.5 },
    ])).toBeCloseTo(0.75);
  });

  it('penalizes efficiency proportionally to the striking fraction', () => {
    // 1 active (eff 1.0) out of 2 total → strikeCoef 0.5 → 1.0 * 0.5 = 0.5
    expect(svc.workshopLabourEfficiency([
      { isOnStrike: false, efficiency: 1.0 },
      { isOnStrike: true, efficiency: 1.0 },
    ])).toBeCloseTo(0.5);
  });
});

describe('HRService.avgActiveMood', () => {
  it('returns 0 when there are no active employees', () => {
    expect(svc.avgActiveMood([{ isOnStrike: true, mood: 0.9 }])).toBe(0);
  });

  it('averages mood across active employees only', () => {
    expect(svc.avgActiveMood([
      { isOnStrike: false, mood: 0.8 },
      { isOnStrike: false, mood: 0.4 },
      { isOnStrike: true, mood: 0.1 },
    ])).toBeCloseTo(0.6);
  });
});
