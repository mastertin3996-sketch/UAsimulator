import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { TickEngine } from "@/engine/TickEngine";

const engine = new TickEngine();

// Порівнюємо хеші (не самі рядки) — фіксована довжина прибирає ризик timing-атаки
// через різницю в довжині секрету, а не лише через ранній вихід посимвольного порівняння.
function isValidCronSecret(authHeader: string | null): boolean {
  if (!process.env.CRON_SECRET) return false; // ніколи не пускаємо, якщо секрет не налаштовано
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  const provided = authHeader ?? "";
  const expectedHash = createHash("sha256").update(expected).digest();
  const providedHash  = createHash("sha256").update(provided).digest();
  return timingSafeEqual(expectedHash, providedHash);
}

export async function GET(req: NextRequest) {
  if (!isValidCronSecret(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const start   = Date.now();
    const summary = await engine.processNextTick();
    return NextResponse.json({
      ok:         true,
      tickNumber: summary.tickNumber.toString(),
      durationMs: Date.now() - start,
      errors:     summary.errors,
      timings:    summary.timings,
      ...(summary.skipped && { skipped: true, skipReason: summary.skipReason }),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[CRON_TICK]", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
