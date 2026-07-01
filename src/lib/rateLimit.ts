// Легкий in-memory rate-limiter для чутливих ендпоінтів (кредити, M&A).
// Best-effort: на serverless кожен "теплий" інстанс тримає свою мапу, тому це не
// бездоганний захист при масштабуванні на багато інстансів, але суттєво ускладнює
// спам/race-exploit одного гравця в межах теплого інстансу — краще, ніж нічого.

const hits = new Map<string, number>(); // key → timestamp останнього дозволеного виклику

/** Повертає true, якщо виклик дозволено (і одразу реєструє його), false — якщо занадто рано. */
export function allowRate(key: string, minIntervalMs: number): boolean {
  const now  = Date.now();
  const last = hits.get(key);
  if (last !== undefined && now - last < minIntervalMs) return false;
  hits.set(key, now);
  return true;
}
