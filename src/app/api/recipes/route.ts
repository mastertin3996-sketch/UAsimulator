import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EnterpriseType } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") as EnterpriseType | null;

  const recipes = await prisma.recipe.findMany({
    where: type ? { enterpriseType: type } : undefined,
    select: {
      id: true, name: true, enterpriseType: true,
      ticksToComplete: true, laborHoursPerUnit: true,
      baseQuality: true, powerKwhPerUnit: true,
      inputs: {
        select: {
          quantityPerUnit: true,
          product: { select: { id: true, sku: true, nameUa: true, unit: true } },
        },
      },
      outputs: {
        select: {
          quantityPerUnit: true,
          product: { select: { id: true, sku: true, nameUa: true, unit: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ recipes });
}
