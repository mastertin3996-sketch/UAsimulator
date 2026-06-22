/**
 * PATCH /api/lines/:lid — встановити рецепт на лінію / перейменувати
 * Body: { recipeId?: string | null, name?: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { auth }                      from "@/lib/auth";
import { prisma }                    from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ lid: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { lid } = await params;
  const body = await req.json() as { recipeId?: string | null; name?: string; loadFactor?: number };

  const line = await prisma.productionLine.findUnique({
    where : { id: lid },
    select: {
      id      : true,
      workshop: {
        select: {
          type  : true,
          office: {
            select: {
              enterprise: {
                select: {
                  enterpriseTypeId: true,
                  company: { select: { ownerId: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!line) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (line.workshop.office.enterprise.company.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Валідація рецепту: рецепт має підходити до enterpriseCategory або enterpriseTypeId
  if (body.recipeId) {
    const recipe = await prisma.productionRecipe.findUnique({
      where : { id: body.recipeId },
      select: { id: true, enterpriseTypeId: true, enterpriseCategory: true },
    });
    if (!recipe) return NextResponse.json({ error: "Рецепт не знайдено" }, { status: 404 });
  }

  const clampedLoad = body.loadFactor != null
    ? Math.max(0, Math.min(1, Number(body.loadFactor)))
    : undefined;

  const updated = await prisma.productionLine.update({
    where: { id: lid },
    data : {
      ...(body.recipeId !== undefined  && { recipeId: body.recipeId }),
      ...(body.name?.trim()            && { name: body.name.trim() }),
      ...(clampedLoad   != null        && { loadFactor: clampedLoad }),
    },
  });

  return NextResponse.json({ ok: true, line: updated });
}
