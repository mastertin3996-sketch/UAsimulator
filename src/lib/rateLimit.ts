// Rate-limiter для чутливих ендпоінтів (кредити, M&A).
//
// Якщо задано UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN — використовує
// Upstash Redis (SET NX PX, атомарно, переживає холодний старт serverless-функції
// і працює однаково для всіх інстансів).
//
// Без цих змінних — падає назад на in-memory Map у межах одного "теплого"
// інстансу (best-effort, як було раніше) — щоб локальна розробка й дешевший
// деплой без Redis і далі працювали без зайвої обов'язкової залежності.

import { Redis } from "@upstash/redis";

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

const hits = new Map<string, number>(); // key → timestamp останнього дозволеного виклику (fallback)

function allowRateInMemory(key: string, minIntervalMs: number): boolean {
  const now = Date.now();
  const last = hits.get(key);
  if (last !== undefined && now - last < minIntervalMs) return false;
  hits.set(key, now);
  return true;
}

/** Повертає true, якщо виклик дозволено (і одразу реєструє його), false — якщо занадто рано. */
export async function allowRate(key: string, minIntervalMs: number): Promise<boolean> {
  if (!redis) return allowRateInMemory(key, minIntervalMs);

  try {
    const ok = await redis.set(key, Date.now(), { nx: true, px: minIntervalMs });
    return ok !== null;
  } catch {
    // Redis недоступний — не блокуємо гравця через інфраструктурний збій.
    return allowRateInMemory(key, minIntervalMs);
  }
}
