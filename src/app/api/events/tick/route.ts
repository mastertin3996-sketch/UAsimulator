import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Server-Sent Events: polls DB every 8s and pushes tick events to client.
// Works on Vercel Edge/Serverless with streaming response.
export const dynamic = "force-dynamic";
export const maxDuration = 55; // seconds — Vercel Pro limit

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch { /* client disconnected */ }
      };

      // Send initial state immediately
      const first = await prisma.gameTick.findFirst({
        orderBy: { tickNumber: "desc" },
        select:  { tickNumber: true, durationMs: true },
      });
      const init = Number(first?.tickNumber ?? 0);
      send({ type: "init", tickNumber: init, durationMs: first?.durationMs ?? 0 });

      let lastSeen = BigInt(init);
      let alive    = true;

      // Poll every 8 seconds for up to maxDuration
      const endAt = Date.now() + 50_000; // stop 5s before Vercel cuts us
      while (alive && Date.now() < endAt) {
        await new Promise((r) => setTimeout(r, 8_000));
        try {
          const latest = await prisma.gameTick.findFirst({
            orderBy: { tickNumber: "desc" },
            select:  { tickNumber: true, durationMs: true },
          });
          if (latest && latest.tickNumber > lastSeen) {
            lastSeen = latest.tickNumber;
            send({ type: "tick", tickNumber: Number(lastSeen), durationMs: latest.durationMs ?? 0 });
          } else {
            // heartbeat to keep connection alive
            send({ type: "ping" });
          }
        } catch {
          alive = false;
        }
      }

      // Tell client to reconnect
      send({ type: "reconnect" });
      try { controller.close(); } catch { /* already closed */ }
    },
    cancel() { /* client disconnected — loop will end naturally */ },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection":    "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
