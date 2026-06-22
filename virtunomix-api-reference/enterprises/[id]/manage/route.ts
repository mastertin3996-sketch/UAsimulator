import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json() as {
    workers?: number;
    salary?: number;
    retailPrice?: number;
    productId?: string;
    isActive?: boolean;
    recipeId?: string;
  };

  // Перевіряємо що підприємство належить поточному гравцю
  const enterprise = await prisma.enterprise.findUnique({
    where: { id },
    include: {
      company: { select: { ownerId: true } },
      enterpriseType: { select: { category: true } },
      shopSettings: true,
    },
  });

  if (!enterprise) return NextResponse.json({ error: "Підприємство не знайдено" }, { status: 404 });
  if (enterprise.company.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Доступ заборонено" }, { status: 403 });
  }

  const updates: Record<string, unknown> = {};
  const errors: string[] = [];

  // Зміна кількості робітників
  if (body.workers !== undefined) {
    const w = Math.round(body.workers);
    if (w < 0 || w > enterprise.workersMax) {
      errors.push(`Кількість робітників: 0..${enterprise.workersMax}`);
    } else {
      updates.workersCurrent = w;
    }
  }

  // Зміна зарплати
  if (body.salary !== undefined) {
    if (body.salary < 0 || body.salary > 100_000) {
      errors.push("Зарплата: 0..100 000 GC");
    } else {
      updates.salaryOffered = body.salary;
    }
  }

  // Увімкнути / вимкнути підприємство
  if (body.isActive !== undefined) {
    updates.isActive = body.isActive;
  }

  // Призначити рецепт (для EXTRACTION та PRODUCTION)
  if (body.recipeId !== undefined) {
    const recipe = await prisma.productionRecipe.findUnique({ where: { id: body.recipeId } });
    if (!recipe) {
      errors.push("Рецепт не знайдено");
    } else {
      updates.recipeId = body.recipeId;
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join("; ") }, { status: 400 });
  }

  // Застосовуємо зміни підприємства
  const updated = await prisma.$transaction(async (tx) => {
    const ent = Object.keys(updates).length
      ? await tx.enterprise.update({ where: { id }, data: updates })
      : await tx.enterprise.findUnique({ where: { id } });

    // Налаштування магазину — тільки для TRADE підприємств
    if (enterprise.enterpriseType.category === "TRADE") {
      if (body.retailPrice !== undefined || body.productId !== undefined) {
        if (body.retailPrice !== undefined && body.retailPrice <= 0) {
          throw new Error("Ціна повинна бути > 0");
        }
        const productId = body.productId ?? enterprise.shopSettings[0]?.productId;
        const retailPrice = body.retailPrice ?? Number(enterprise.shopSettings[0]?.retailPrice ?? 10);

        if (!productId) throw new Error("Вкажіть productId для магазину");

        await tx.shopSetting.upsert({
          where: { enterpriseId_productId: { enterpriseId: id, productId } },
          create: { enterpriseId: id, productId, retailPrice },
          update: { ...(body.retailPrice !== undefined ? { retailPrice: body.retailPrice } : {}) },
        });
      }
    }

    return ent;
  });

  return NextResponse.json({ enterprise: updated });
}
