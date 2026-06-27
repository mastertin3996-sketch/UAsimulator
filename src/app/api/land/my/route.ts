import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const plots = await prisma.landPlot.findMany({
    where:   { playerId: session.user.id },
    select: {
      id: true, status: true, totalAreaM2: true, usedAreaM2: true,
      soilQuality: true, city: { select: { nameUa: true } },
    },
  });

  return NextResponse.json({ plots });
}
