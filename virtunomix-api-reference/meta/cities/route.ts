import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cities = await prisma.city.findMany({
    orderBy: { population: "desc" },
    select: { id: true, name: true, population: true, wealthIndex: true },
  });
  return NextResponse.json({ cities: cities.map((c) => ({ ...c, wealthIndex: Number(c.wealthIndex) })) });
}
