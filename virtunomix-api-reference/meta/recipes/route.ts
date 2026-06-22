import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const recipes = await prisma.productionRecipe.findMany({
    include: {
      outputProduct: { select: { name: true, unit: true } },
      inputs: { include: { product: { select: { name: true, unit: true } } } },
    },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({
    recipes: recipes.map((r) => ({
      ...r,
      outputAmount: Number(r.outputAmount),
    })),
  });
}
