import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const player = await prisma.player.findUnique({
    where:  { id: session.user.id },
    select: { cashBalance: true, balanceUsd: true, companyName: true },
  });

  if (!player) return NextResponse.json({ error: "Player not found" }, { status: 404 });

  return NextResponse.json({
    cashBalance: Number(player.cashBalance),
    balanceUsd:  Number(player.balanceUsd),
    companyName: player.companyName,
  });
}
