import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;

  const current = await prisma.player.findUnique({ where: { id: playerId }, select: { prestigeLevel: true } });
  const newPrestigeLevel = (current?.prestigeLevel ?? 0) + 1;
  // М'який престиж: кожен reset дає невеликий постійний бонус до стартового капіталу
  // та кредитного рейтингу — reset відчувається як прогрес, а не втрата.
  const prestigeStartCash   = 50_000 + newPrestigeLevel * 5_000;
  const prestigeCreditBonus = Math.min(1.0, newPrestigeLevel * 0.1);

  // Get enterprise IDs first (needed for nested deletes)
  const ents = await prisma.enterprise.findMany({ where: { playerId }, select: { id: true } });
  const entIds = ents.map((e) => e.id);
  const workshops = entIds.length > 0
    ? await prisma.workshop.findMany({ where: { enterpriseId: { in: entIds } }, select: { id: true } })
    : [];
  const wsIds = workshops.map((w) => w.id);

  await prisma.$transaction([
    prisma.marketOrder.deleteMany({ where: { playerId } }),
    prisma.enterpriseInventory.deleteMany({ where: { enterpriseId: { in: entIds } } }),
    prisma.playerInventory.deleteMany({ where: { playerId } }),
    prisma.financialTransaction.deleteMany({ where: { playerId } }),
    prisma.financialLog.deleteMany({ where: { playerId } }),
    prisma.dailySnapshot.deleteMany({ where: { playerId } }),
    ...(entIds.length > 0 ? [prisma.productionLog.deleteMany({ where: { enterpriseId: { in: entIds } } })] : []),
    prisma.employee.deleteMany({ where: { enterpriseId: { in: entIds } } }),
    prisma.equipment.deleteMany({ where: { workshopId: { in: wsIds } } }),
    prisma.workshop.deleteMany({ where: { enterpriseId: { in: entIds } } }),
    prisma.enterprise.deleteMany({ where: { playerId } }),
    // Звільнити всі орендовані / куплені ділянки
    prisma.landPlot.updateMany({
      where: { playerId },
      data: { playerId: null, status: "AVAILABLE", leaseStartDate: null, usedAreaM2: 0 },
    }),
    prisma.player.update({
      where: { id: playerId },
      data: {
        cashBalance:              prestigeStartCash,
        balanceUsd:               0,
        netWorth:                 prestigeStartCash,
        reputationScore:          5.0,
        creditRating:             7.0 + prestigeCreditBonus,
        currentOverdraftUsageUah: 0,
        companyValuationUah:      0,
        prestigeLevel:            newPrestigeLevel,
      },
    }),
  ]);

  return NextResponse.json({ ok: true, prestigeLevel: newPrestigeLevel, startCash: prestigeStartCash });
}
