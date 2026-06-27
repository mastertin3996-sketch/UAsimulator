import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NpcCompetitorService } from "@/engine/NpcCompetitorService";

const svc = new NpcCompetitorService(prisma);

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const stats = await svc.getCompetitorStats();
  return NextResponse.json(stats);
}
