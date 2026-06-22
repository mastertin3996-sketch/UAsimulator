import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const types = await prisma.enterpriseType.findMany({
    orderBy : [{ category: "asc" }, { name: "asc" }],
    include : {
      recipes: {
        select: {
          outputAmount : true,
          outputProduct: { select: { name: true, unit: true, icon: true } },
        },
      },
    },
  });
  return NextResponse.json({ types });
}
