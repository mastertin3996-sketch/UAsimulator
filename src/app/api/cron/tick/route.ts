import { NextRequest, NextResponse } from "next/server";
import { TickEngine } from "@/engine/TickEngine";

const engine = new TickEngine();

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[CRON_TICK]", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
