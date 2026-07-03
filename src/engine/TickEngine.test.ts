import { describe, it, expect } from 'vitest';
import { shouldSkipTick } from './TickEngine';

describe('shouldSkipTick', () => {
  it('does not skip when there is no previous tick', () => {
    expect(shouldSkipTick(null).skip).toBe(false);
  });

  it('does not skip when the previous tick already completed', () => {
    const lastTick = { tickNumber: 5n, completedAt: new Date(), startedAt: new Date() };
    expect(shouldSkipTick(lastTick).skip).toBe(false);
  });

  it('skips when the previous tick started recently and has not completed', () => {
    const now = Date.now();
    const lastTick = { tickNumber: 5n, completedAt: null, startedAt: new Date(now - 5 * 60 * 1000) }; // 5 min ago
    const result = shouldSkipTick(lastTick, now);
    expect(result.skip).toBe(true);
    expect(result.reason).toContain('#5');
  });

  it('does not skip when the previous tick is stale (crashed without completing)', () => {
    const now = Date.now();
    const lastTick = { tickNumber: 5n, completedAt: null, startedAt: new Date(now - 60 * 60 * 1000) }; // 60 min ago
    expect(shouldSkipTick(lastTick, now).skip).toBe(false);
  });

  it('treats a tick right at the staleness boundary as still running', () => {
    const now = Date.now();
    const lastTick = { tickNumber: 5n, completedAt: null, startedAt: new Date(now - 54 * 60 * 1000) }; // 54 min ago
    expect(shouldSkipTick(lastTick, now).skip).toBe(true);
  });
});
