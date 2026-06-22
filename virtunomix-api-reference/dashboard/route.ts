import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EQUIPMENT_TYPES } from "@/lib/equipment-config";

type Warning = {
  type    : "EQUIPMENT_WORN" | "EQUIPMENT_BROKEN" | "STRIKE" | "NO_RECIPE";
  severity: "error" | "warning";
  enterpriseId  : string;
  enterpriseName: string;
  detail        : string;
};

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [user, company] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { level: true },
    }),
    prisma.company.findFirst({
      where: { ownerId: session.user.id },
      include: {
        enterprises: {
          select: {
            id: true, name: true, isActive: true, level: true, size: true,
            workersCurrent: true, workersMax: true, salaryOffered: true,
            efficiency: true, strikeEndsAt: true, createdAt: true,
            enterpriseType: {
              select: { name: true, category: true, icon: true, baseRentPerTick: true },
            },
            city: { select: { name: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
  ]);

  if (!company) return NextResponse.json({ company: null, userLevel: user?.level ?? 1 });

  const wallet = await prisma.userWallet.findUnique({
    where: { userId: session.user.id },
  });

  // Поточний тік
  const lastTick = await prisma.gameTick.findFirst({
    orderBy: { tickNumber: "desc" },
    select: { id: true, tickNumber: true },
  });

  // Прибуток/збиток по підприємствах з останнього тіку (через financialTransaction)
  const enterpriseNetMap = new Map<string, number>();
  if (lastTick) {
    const txnsLastTick = await prisma.financialTransaction.findMany({
      where: {
        companyId: company.id,
        tickId   : lastTick.id,
        relatedEntityId: { not: null },
      },
      select: { relatedEntityId: true, amount: true },
    });
    for (const tx of txnsLastTick) {
      if (!tx.relatedEntityId) continue;
      const cur = enterpriseNetMap.get(tx.relatedEntityId) ?? 0;
      enterpriseNetMap.set(tx.relatedEntityId, cur + Number(tx.amount));
    }
  }

  // Фінансові транзакції для графіку
  const txns = await prisma.financialTransaction.findMany({
    where: { companyId: company.id },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      type: true,
      amount: true,
      currency: true,
      description: true,
      createdAt: true,
      tick: { select: { tickNumber: true } },
    },
  });

  const tickMap = new Map<number, { tick: number; revenue: number; expenses: number }>();
  for (const t of txns) {
    const tickNum = t.tick?.tickNumber ?? 0;
    if (!tickMap.has(tickNum)) tickMap.set(tickNum, { tick: tickNum, revenue: 0, expenses: 0 });
    const entry = tickMap.get(tickNum)!;
    const amt = Number(t.amount);
    if (["RETAIL_SALE", "MARKET_SALE", "DEPOSIT"].includes(t.type)) entry.revenue += amt;
    else entry.expenses += Math.abs(amt);
  }

  const chartData = Array.from(tickMap.values())
    .sort((a, b) => a.tick - b.tick)
    .slice(-10)
    .map((d) => ({ ...d, profit: d.revenue - d.expenses }));

  // ── Warnings ──────────────────────────────────────────────────────────────
  const warnings: Warning[] = [];

  if (company) {
    const entIds = company.enterprises.map((e) => e.id);
    const currentTick = lastTick?.tickNumber ?? 0;

    // 1. Strike
    const strikingEnts = company.enterprises.filter(
      (e) => e.strikeEndsAt !== null && Number(e.strikeEndsAt) > currentTick,
    );
    for (const e of strikingEnts) {
      warnings.push({
        type: "STRIKE", severity: "error",
        enterpriseId: e.id, enterpriseName: e.name,
        detail: `Страйк активний до тіку #${e.strikeEndsAt}`,
      });
    }

    // 2. Equipment wear ≥ 80% and broken
    const wornEquip = await prisma.lineEquipment.findMany({
      where: {
        wearPercent: { gte: 80 },
        line: { workshop: { office: { enterpriseId: { in: entIds } } } },
      },
      select: {
        id: true, equipmentTypeId: true, wearPercent: true,
        line: {
          select: {
            name    : true,
            workshop: { select: { office: { select: { enterprise: { select: { id: true, name: true } } } } } },
          },
        },
      },
    });
    for (const eq of wornEquip) {
      const ent      = eq.line.workshop.office.enterprise;
      const spec     = EQUIPMENT_TYPES[eq.equipmentTypeId];
      const eqName   = spec?.name ?? eq.equipmentTypeId;
      const wear     = Number(eq.wearPercent);
      const isBroken = wear >= 100;
      warnings.push({
        type    : isBroken ? "EQUIPMENT_BROKEN" : "EQUIPMENT_WORN",
        severity: isBroken ? "error" : "warning",
        enterpriseId  : ent.id,
        enterpriseName: ent.name,
        detail: isBroken
          ? `${eqName} на лінії «${eq.line.name}» зламане (100%)`
          : `${eqName} на лінії «${eq.line.name}» — знос ${wear.toFixed(0)}%`,
      });
    }

    // 3. Active production lines without a recipe
    const linesNoRecipe = await prisma.productionLine.findMany({
      where: {
        recipeId: null,
        isActive: true,
        workshop: { office: { enterpriseId: { in: entIds } } },
      },
      select: {
        name    : true,
        workshop: { select: { office: { select: { enterprise: { select: { id: true, name: true } } } } } },
      },
    });
    for (const ln of linesNoRecipe) {
      const ent = ln.workshop.office.enterprise;
      warnings.push({
        type: "NO_RECIPE", severity: "warning",
        enterpriseId  : ent.id,
        enterpriseName: ent.name,
        detail: `Лінія «${ln.name}» не має рецепту — виробництво не запущено`,
      });
    }
  }

  // Топ продажів магазинів
  const salesByEnterprise = await prisma.retailSalesLog.groupBy({
    by: ["enterpriseId"],
    where: { enterprise: { companyId: company.id } },
    _sum: { revenue: true, quantitySold: true },
    orderBy: { _sum: { revenue: "desc" } },
    take: 5,
  });
  const entNames = await prisma.enterprise.findMany({
    where: { id: { in: salesByEnterprise.map((s) => s.enterpriseId) } },
    select: { id: true, name: true },
  });
  const nameMap = Object.fromEntries(entNames.map((e) => [e.id, e.name]));

  // Unread notifications count
  const unreadNotifications = await prisma.notification.count({
    where: { userId: session.user.id, isRead: false },
  });

  return NextResponse.json({
    userLevel: user?.level ?? 1,
    unreadNotifications,
    company: {
      id: company.id,
      name: company.name,
      slogan: company.slogan,
      rating: Number(company.rating),
      brandLevel: company.brandLevel,
      totalAssets: Number(company.totalAssets),
      enterprises: company.enterprises.length,
      activeEnterprises: company.enterprises.filter((e) => e.isActive).length,
    },
    wallet: {
      gameCash: Number(wallet?.gameCash ?? 0),
      premiumCoin: Number(wallet?.premiumCoin ?? 0),
    },
    enterprises: company.enterprises.map((e) => {
      const rentPerTick =
        Number(e.enterpriseType.baseRentPerTick) * e.size * (1 + 0.15 * (e.level - 1));
      const salaryPerTick = e.workersCurrent * Number(e.salaryOffered);
      const lastTickNet = enterpriseNetMap.get(e.id) ?? null;
      return {
        id: e.id,
        name: e.name,
        typeName: e.enterpriseType.name,
        typeIcon: e.enterpriseType.icon,
        category: e.enterpriseType.category,
        city: e.city.name,
        level: e.level,
        efficiency: Number(e.efficiency),
        workersCurrent: e.workersCurrent,
        workersMax: e.workersMax,
        rentPerTick,
        salaryPerTick,
        costsPerTick: rentPerTick + salaryPerTick,
        lastTickNet,
        isActive: e.isActive,
      };
    }),
    chartData,
    topSales: salesByEnterprise.map((s) => ({
      name: nameMap[s.enterpriseId] ?? "—",
      revenue: Number(s._sum.revenue ?? 0),
      quantity: Number(s._sum.quantitySold ?? 0),
    })),
    currentTick: lastTick?.tickNumber ?? 0,
    warnings,
    recentTxns: txns.slice(0, 12).map((t) => ({
      type: t.type,
      amount: Number(t.amount),
      currency: t.currency,
      description: t.description,
      date: t.createdAt,
    })),
  });
}
