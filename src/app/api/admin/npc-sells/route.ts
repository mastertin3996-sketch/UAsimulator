import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { MarketService } from "@/engine/MarketService";
import { prisma } from "@/lib/prisma";

const market = new MarketService(prisma);
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "mastertin3996@gmail.com";

export async function POST(req: NextRequest) {
  const bearer = req.headers.get("authorization")?.replace("Bearer ", "");
  const secret = process.env.CRON_SECRET;
  if (bearer !== secret) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.user.email !== ADMIN_EMAIL) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const count = await market.generateNpcSellOrders();
  return NextResponse.json({ ok: true, created: count });
}
