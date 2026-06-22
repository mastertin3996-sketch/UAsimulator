/**
 * Vercel Cron endpoint — advances the game by one tick.
 *
 * Called automatically every hour by Vercel Cron (see vercel.json).
 * Protected by CRON_SECRET to prevent manual triggering.
 *
 * Set in Vercel project env:
 *   CRON_SECRET  — any random string (e.g. `openssl rand -hex 32`)
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { prisma }      from '../../src/lib/prisma';
import { TickEngine }  from '../../src/services/TickEngine';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // Vercel Cron calls with Authorization: Bearer <CRON_SECRET>
  const secret  = process.env.CRON_SECRET;
  const authHdr = req.headers['authorization'];

  if (secret && authHdr !== `Bearer ${secret}`) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }

  const engine  = new TickEngine(prisma);
  const summary = await engine.processNextTick();

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    ok:          true,
    tick:        summary.tickNumber.toString(),
    durationMs:  summary.durationMs,
    players:     summary.playersProcessed,
    trades:      summary.tradesExecuted,
    errors:      summary.errors.length,
  }));
}
