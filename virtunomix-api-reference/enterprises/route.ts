import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canCreateEnterprise } from "@/lib/qualification";
import { logAudit } from "@/lib/audit";
import type { EnterpriseCategory } from "@/generated/prisma/client";
import { getEnterpriseRoles } from "@/lib/hr-config";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const company = await prisma.company.findFirst({ where: { ownerId: session.user.id } });
  if (!company) return NextResponse.json({ enterprises: [] });

  const enterprises = await prisma.enterprise.findMany({
    where: { companyId: company.id },
    include: {
      enterpriseType: true,
      city    : { select: { name: true, wealthIndex: true } },
      recipe  : { select: { name: true, outputProduct: { select: { name: true, unit: true } } } },
      inventory: { include: { product: { select: { name: true, unit: true } } } },
      office  : {
        select: {
          workshops: {
            select: {
              lines: {
                select: {
                  id      : true,
                  recipeId: true,
                  isActive: true,
                  equipment: { select: { wearPercent: true } },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const entIds = enterprises.map((e) => e.id);

  // Last-tick net per enterprise
  const lastTick = await prisma.gameTick.findFirst({
    orderBy: { tickNumber: "desc" },
    select : { id: true },
  });
  const lastTickNetMap = new Map<string, number>();
  if (lastTick) {
    const txns = await prisma.financialTransaction.findMany({
      where : { companyId: company.id, tickId: lastTick.id, relatedEntityId: { in: entIds } },
      select: { relatedEntityId: true, amount: true },
    });
    for (const t of txns) {
      if (!t.relatedEntityId) continue;
      lastTickNetMap.set(t.relatedEntityId, (lastTickNetMap.get(t.relatedEntityId) ?? 0) + Number(t.amount));
    }
  }

  return NextResponse.json({
    enterprises: enterprises.map((e) => {
      const allLines = e.office?.workshops.flatMap((ws) => ws.lines) ?? [];
      const allEquip = allLines.flatMap((ln) => ln.equipment);

      const wornEquip   = allEquip.filter((eq) => Number(eq.wearPercent) >= 80 && Number(eq.wearPercent) < 100).length;
      const brokenEquip = allEquip.filter((eq) => Number(eq.wearPercent) >= 100).length;
      const totalLines  = allLines.length;
      const linesNoRecipe = allLines.filter((ln) => ln.isActive && !ln.recipeId).length;

      return {
        id: e.id,
        name: e.name,
        category: e.enterpriseType.category,
        typeName: e.enterpriseType.name,
        typeIcon: e.enterpriseType.icon,
        cityName: e.city.name,
        level: e.level,
        size: e.size,
        workersCurrent: e.workersCurrent,
        workersMax: e.workersMax,
        salaryOffered: Number(e.salaryOffered),
        quality: Number(e.quality),
        efficiency: Number(e.efficiency),
        isActive: e.isActive,
        strikeEndsAt: e.strikeEndsAt,
        recipeName: e.recipe?.name ?? null,
        outputProduct: e.recipe?.outputProduct ?? null,
        rentPerTick  : Number(e.enterpriseType.baseRentPerTick) * e.size * (1 + 0.15 * (e.level - 1)),
        salaryPerTick: e.workersCurrent * Number(e.salaryOffered),
        lastTickNet  : lastTickNetMap.get(e.id) ?? null,
        wornEquip,
        brokenEquip,
        totalLines,
        linesNoRecipe,
        inventory: e.inventory.map((inv) => ({
          product : inv.product.name,
          unit    : inv.product.unit,
          quantity: Number(inv.quantity),
        })),
      };
    }),
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, enterpriseTypeId, cityId, recipeId } = await req.json();

  if (!name || !enterpriseTypeId || !cityId) {
    return NextResponse.json({ error: "Заповніть всі обов'язкові поля" }, { status: 400 });
  }

  const company = await prisma.company.findFirst({ where: { ownerId: session.user.id } });
  if (!company) return NextResponse.json({ error: "Спочатку створіть компанію" }, { status: 400 });

  const eType = await prisma.enterpriseType.findUnique({ where: { id: enterpriseTypeId } });
  if (!eType) return NextResponse.json({ error: "Тип підприємства не знайдено" }, { status: 404 });

  // ── Qualification check ────────────────────────────────────────────────────
  const qualCheck = await canCreateEnterprise(
    session.user.id,
    eType.category as EnterpriseCategory,
  );
  if (!qualCheck.allowed) {
    return NextResponse.json(
      { error: qualCheck.message, code: qualCheck.code },
      { status: 403 },
    );
  }

  // Вартість відкриття = 5 × baseRentPerTick
  const openingCost = Number(eType.baseRentPerTick) * 5;
  const wallet = await prisma.userWallet.findUnique({ where: { userId: session.user.id } });
  if (!wallet || Number(wallet.gameCash) < openingCost) {
    return NextResponse.json({
      error: `Недостатньо GC. Потрібно: ${openingCost.toLocaleString()} GC`,
    }, { status: 400 });
  }

  let enterprise: { id: string; name: string } & Record<string, unknown>;
  try {
    const [created] = await prisma.$transaction([
      prisma.enterprise.create({
        data: {
          companyId: company.id,
          enterpriseTypeId,
          cityId,
          recipeId: recipeId || null,
          name: name.trim(),
          workersMax: eType.workersPerUnit,
        },
      }),
      prisma.userWallet.update({
        where: { userId: session.user.id },
        data: { gameCash: { decrement: openingCost } },
      }),
      prisma.financialTransaction.create({
        data: {
          companyId: company.id,
          type: "RENT",
          currency: "GAME_CASH",
          amount: -openingCost,
          balanceAfter: Number(wallet.gameCash) - openingCost,
          description: `Відкриття підприємства «${name.trim()}»`,
        },
      }),
    ]);
    enterprise = created;
  } catch (err: unknown) {
    console.error("[enterprises POST] transaction error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Ініціалізуємо per-role зарплати на рівні ринкової ставки
  const city  = await prisma.city.findUnique({ where: { id: cityId }, select: { name: true } });
  const roles = getEnterpriseRoles(enterpriseTypeId, city?.name ?? "Київ");
  if (roles.length > 0) {
    await prisma.enterpriseRoleSalary.createMany({
      data: roles.map((r) => ({
        enterpriseId : enterprise.id,
        roleId       : r.id,
        salaryOffered: r.marketSalaryLocal,
      })),
      skipDuplicates: true,
    });
  }

  logAudit({
    actorId  : session.user.id,
    type     : "ENTERPRISE_PURCHASED",
    amount   : openingCost,
    currency : "GAME_CASH",
    relatedId: enterprise.id,
    details  : { enterpriseName: name.trim(), enterpriseTypeId, cityId },
    ipAddress: req.headers.get("x-client-ip") ?? undefined,
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ enterprise }, { status: 201 });
}
