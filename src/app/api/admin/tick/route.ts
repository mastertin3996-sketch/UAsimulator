import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { TickEngine } from "@/engine/TickEngine";

const engine = new TickEngine();

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const start   = Date.now();
    const summary = await engine.processNextTick();
    const durationMs = Date.now() - start;

    return NextResponse.json({
      tickNumber: summary.tickNumber.toString(),
      durationMs,
      errors:     summary.errors,
      ...(summary.skipped && { skipped: true, skipReason: summary.skipReason }),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[TICK_ROUTE]", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
