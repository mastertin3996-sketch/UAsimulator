import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ResearchDevelopmentService } from "@/engine/ResearchDevelopmentService";
import { TechCode } from "@prisma/client";

const unlockTechSchema = z.object({
  techCode: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;
  const rawBody = await req.json().catch(() => null);
  const parsed  = unlockTechSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Потрібен techCode" }, { status: 400 });
  }
  const body = parsed.data;

  const svc = new ResearchDevelopmentService(prisma);
  try {
    await svc.unlockTechnology(playerId, body.techCode as TechCode);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Помилка";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
