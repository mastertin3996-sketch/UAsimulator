import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;
  const { id: workshopId } = await params;

  const workshop = await prisma.workshop.findFirst({
    where: { id: workshopId, enterprise: { playerId } },
    select: {
      id: true, name: true, maxCapacity: true, currentVolume: true, isActive: true,
      enterprise: { select: { type: true } },
      productionOrders: {
        where: { status: "IN_PROGRESS" },
        select: {
          id: true, targetQuantity: true, completedQuantity: true,
          outputQuality: true, ticksRemaining: true, startedAt: true,
          recipe: {
            select: {
              id: true, name: true,
              inputs: { select: { quantityPerUnit: true, product: { select: { nameUa: true, unit: true } } } },
              outputs: { select: { quantityPerUnit: true, product: { select: { nameUa: true, unit: true } } } },
            },
          },
        },
      },
    },
  });

  if (!workshop) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  return NextResponse.json({ workshop });
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;
  const { id: workshopId } = await params;

  const workshop = await prisma.workshop.findFirst({
    where: { id: workshopId, enterprise: { playerId } },
    select: { id: true, isActive: true, enterprise: { select: { type: true } } },
  });
  if (!workshop) return NextResponse.json({ error: "Цех не знайдено" }, { status: 404 });

  const body = await req.json().catch(() => ({})) as { recipeId?: string; targetQuantity?: number };
  if (!body.recipeId) return NextResponse.json({ error: "Потрібен recipeId" }, { status: 400 });

  const recipe = await prisma.recipe.findUnique({
    where: { id: body.recipeId },
    select: { id: true, enterpriseType: true, ticksToComplete: true },
  });
  if (!recipe) return NextResponse.json({ error: "Рецепт не знайдено" }, { status: 404 });
  if (recipe.enterpriseType !== workshop.enterprise.type) {
    return NextResponse.json({ error: `Рецепт призначений для ${recipe.enterpriseType}, а не ${workshop.enterprise.type}` }, { status: 400 });
  }

  // Cancel any existing active orders in this workshop
  await prisma.productionOrder.updateMany({
    where: { workshopId, status: "IN_PROGRESS" },
    data: { status: "CANCELLED" },
  });

  const targetQuantity = body.targetQuantity ?? 999_999;

  const order = await prisma.productionOrder.create({
    data: {
      workshopId,
      recipeId: body.recipeId,
      targetQuantity,
      ticksRemaining: recipe.ticksToComplete,
      status: "IN_PROGRESS",
    },
  });

  return NextResponse.json({ ok: true, order: { id: order.id } }, { status: 201 });
}
