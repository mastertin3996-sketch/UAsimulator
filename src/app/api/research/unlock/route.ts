import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ResearchDevelopmentService } from "@/engine/ResearchDevelopmentService";
import { TechCode } from "@prisma/client";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;
  const body = await req.json().catch(() => ({})) as { techCode?: string };

  if (!body.techCode) {
    return NextResponse.json({ error: "Потрібен techCode" }, { status: 400 });
  }

  const svc = new ResearchDevelopmentService(prisma);
  try {
    await svc.unlockTechnology(playerId, body.techCode as TechCode);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Помилка";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
