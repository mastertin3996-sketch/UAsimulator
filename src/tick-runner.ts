/**
 * Tick runner — starts the real-time game loop.
 * 1 real hour = 1 in-game day tick.
 *
 * Usage:
 *   npx ts-node src/tick-runner.ts
 *
 * Set TICK_INTERVAL_MS in .env to override the default 3600000 ms (1 hour).
 */

import { TickEngine } from './services/TickEngine';

const TICK_INTERVAL_MS = parseInt(process.env.TICK_INTERVAL_MS ?? '3600000', 10);

const engine = new TickEngine();

async function runTick() {
  try {
    const summary = await engine.processNextTick();
    if (summary.errors.length > 0) {
      console.warn(`[Runner] ${summary.errors.length} player error(s) this tick.`);
    }
  } catch (err) {
    console.error('[Runner] Fatal tick error:', err);
  }
}

console.log(`UAeconomy tick runner started. Interval: ${TICK_INTERVAL_MS / 1000}s`);

// Run immediately on start, then on interval
runTick().then(() => {
  setInterval(runTick, TICK_INTERVAL_MS);
});

process.on('SIGTERM', () => {
  console.log('[Runner] Shutting down gracefully.');
  process.exit(0);
});
