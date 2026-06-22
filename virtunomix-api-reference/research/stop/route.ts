import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/research/stop
// Body: { enterpriseId }
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const { enterpriseId } = await req.json() as { enterpriseId: string };

  const research = await prisma.techResearch.findUnique({
    where: { userId_enterpriseId: { userId, enterpriseId } },
  });
  if (!research) {
    return NextResponse.json({ error: "Дослідження не знайдено" }, { status: 404 });
  }

  const updated = await prisma.techResearch.update({
    where: { userId_enterpriseId: { userId, enterpriseId } },
    data : { investmentGC: 0, investmentPC: 0, isActive: false },
  });

  return NextResponse.json({ ok: true, enterpriseId: updated.enterpriseId });
}
