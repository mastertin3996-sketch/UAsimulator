import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { MarketService } from "@/engine/MarketService";
import { prisma } from "@/lib/prisma";

const market = new MarketService(prisma);

export async function POST(req: NextRequest) {
  const bearer = req.headers.get("authorization")?.replace("Bearer ", "");
  const secret = process.env.CRON_SECRET;
  if (bearer !== secret) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const count = await market.generateNpcSellOrders();
  return NextResponse.json({ ok: true, created: count });
}
