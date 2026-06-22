import { NextRequest, NextResponse } from "next/server";
import { runGameTick } from "@/lib/tick-engine";

// Секрет для захисту endpoint від зовнішніх викликів.
// Встановіть TICK_SECRET у .env; якщо не задано — ендпоінт доступний локально.
const TICK_SECRET  = process.env.TICK_SECRET  ?? "";
const CRON_SECRET  = process.env.CRON_SECRET  ?? "";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const queryToken = new URL(req.url).searchParams.get("secret") ?? "";
  const provided   = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : queryToken;

  const validSecrets = [TICK_SECRET, CRON_SECRET].filter(Boolean);
  if (validSecrets.length > 0 && !validSecrets.includes(provided)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Захист від паралельного запуску: перевіряємо, чи є активний PROCESSING тік
  const { prisma } = await import("@/lib/prisma");
  const processing = await prisma.gameTick.findFirst({ where: { status: "PROCESSING" } });
  if (processing) {
    return NextResponse.json(
      { error: "Tick already in progress", tickId: processing.id },
      { status: 409 },
    );
  }

  try {
    const stats = await runGameTick();
    return NextResponse.json({ ok: true, stats });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[tick] FAILED:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// GET — стан останніх тіків (для моніторингу)
export async function GET() {
  const { prisma } = await import("@/lib/prisma");
  const ticks = await prisma.gameTick.findMany({
    orderBy : { tickNumber: "desc" },
    take    : 10,
    select  : {
      tickNumber  : true,
      status      : true,
      scheduledAt : true,
      processedAt : true,
    },
  });
  return NextResponse.json({ ticks });
}
