import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

async function getEnterprise(id: string, userId: string) {
  const ent = await prisma.enterprise.findUnique({
    where: { id },
    select: {
      id: true,
      level: true,
      enterpriseTypeId: true,
      enterpriseType: { select: { baseCapacity: true, category: true } },
      company: { select: { ownerId: true } },
    },
  });
  if (!ent || ent.company.ownerId !== userId) return null;
  return ent;
}

// GET — список слотів + доступні рецепти
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const ent = await getEnterprise(id, session.user.id);
  if (!ent) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [slots, allRecipes] = await Promise.all([
    prisma.enterpriseProductionSlot.findMany({
      where: { enterpriseId: id },
      include: {
        recipe: {
          include: {
            outputProduct: { select: { id: true, name: true, icon: true, unit: true, basePrice: true } },
            inputs: {
              include: { product: { select: { id: true, name: true, icon: true, unit: true } } },
            },
          },
        },
      },
      orderBy: { id: "asc" },
    }),
    prisma.productionRecipe.findMany({
      where: { enterpriseTypeId: ent.enterpriseTypeId },
      include: {
        outputProduct: { select: { id: true, name: true, icon: true, unit: true, basePrice: true } },
        inputs: {
          include: { product: { select: { id: true, name: true, icon: true, unit: true } } },
        },
      },
    }),
  ]);

  const usedRecipeIds = new Set(slots.map((s) => s.recipeId));
  const baseCapacity  = ent.enterpriseType.baseCapacity * ent.level;

  const usedPct = slots.reduce((s, slot) => s + slot.allocatedPct, 0);

  return NextResponse.json({
    slots: slots.map((s) => ({
      id          : s.id,
      recipeId    : s.recipeId,
      recipeName  : s.recipe.name,
      allocatedPct: s.allocatedPct,
      outputProduct: s.recipe.outputProduct,
      inputs      : s.recipe.inputs.map((i) => ({
        productId  : i.productId,
        productName: i.product.name,
        productIcon: i.product.icon,
        unit       : i.product.unit,
        amount     : Number(i.amount),
      })),
      estimatedOutput: Math.floor(baseCapacity * (s.allocatedPct / 100) * Number(s.recipe.outputAmount)),
    })),
    availableRecipes: allRecipes
      .filter((r) => !usedRecipeIds.has(r.id))
      .map((r) => ({
        id           : r.id,
        name         : r.name,
        outputProduct: r.outputProduct,
        inputs       : r.inputs.map((i) => ({
          productId  : i.productId,
          productName: i.product.name,
          productIcon: i.product.icon,
          unit       : i.product.unit,
          amount     : Number(i.amount),
        })),
        outputAmount: Number(r.outputAmount),
      })),
    usedPct,
    freePct     : 100 - usedPct,
    baseCapacity,
    category    : ent.enterpriseType.category,
  });
}

// POST — додати слот
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const ent = await getEnterprise(id, session.user.id);
  if (!ent) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const { recipeId, allocatedPct } = body as { recipeId: string; allocatedPct: number };

  if (!recipeId || typeof allocatedPct !== "number" || allocatedPct < 1 || allocatedPct > 100) {
    return NextResponse.json({ error: "recipeId та allocatedPct (1-100) обов'язкові" }, { status: 400 });
  }

  // Validate recipe belongs to this enterprise type
  const recipe = await prisma.productionRecipe.findFirst({
    where: { id: recipeId, enterpriseTypeId: ent.enterpriseTypeId },
  });
  if (!recipe) return NextResponse.json({ error: "Рецепт не підходить для цього типу підприємства" }, { status: 400 });

  // Check capacity
  const existing = await prisma.enterpriseProductionSlot.findMany({ where: { enterpriseId: id } });
  const usedPct  = existing.reduce((s, sl) => s + sl.allocatedPct, 0);
  if (usedPct + allocatedPct > 100) {
    return NextResponse.json({
      error: `Перевищення потужності: зайнято ${usedPct}%, запрошено ще ${allocatedPct}% — сума ${usedPct + allocatedPct}% > 100%`,
    }, { status: 400 });
  }

  const slot = await prisma.enterpriseProductionSlot.create({
    data: { enterpriseId: id, recipeId, allocatedPct },
  });

  return NextResponse.json({ slot });
}

// PATCH — змінити allocatedPct слоту
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const ent = await getEnterprise(id, session.user.id);
  if (!ent) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const { slotId, allocatedPct } = body as { slotId: string; allocatedPct: number };

  if (!slotId || typeof allocatedPct !== "number" || allocatedPct < 1 || allocatedPct > 100) {
    return NextResponse.json({ error: "slotId та allocatedPct (1-100) обов'язкові" }, { status: 400 });
  }

  const existing = await prisma.enterpriseProductionSlot.findMany({ where: { enterpriseId: id } });
  const thisSlot = existing.find((s) => s.id === slotId);
  if (!thisSlot) return NextResponse.json({ error: "Слот не знайдено" }, { status: 404 });

  const usedWithout = existing.reduce((s, sl) => s + (sl.id === slotId ? 0 : sl.allocatedPct), 0);
  if (usedWithout + allocatedPct > 100) {
    return NextResponse.json({
      error: `Перевищення потужності: інші слоти займають ${usedWithout}%, новий ліміт ${allocatedPct}% — сума ${usedWithout + allocatedPct}% > 100%`,
    }, { status: 400 });
  }

  await prisma.enterpriseProductionSlot.update({ where: { id: slotId }, data: { allocatedPct } });
  return NextResponse.json({ ok: true });
}

// DELETE — видалити слот
export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const ent = await getEnterprise(id, session.user.id);
  if (!ent) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { slotId } = await req.json() as { slotId: string };
  if (!slotId) return NextResponse.json({ error: "slotId обов'язковий" }, { status: 400 });

  await prisma.enterpriseProductionSlot.deleteMany({
    where: { id: slotId, enterpriseId: id },
  });

  return NextResponse.json({ ok: true });
}
