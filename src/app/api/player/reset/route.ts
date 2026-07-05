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
  const prestigeStartCash   = 500_000 + newPrestigeLevel * 5_000;
  const prestigeCreditBonus = Math.min(1.0, newPrestigeLevel * 0.1);

  // Get enterprise IDs first (needed for nested deletes)
  const ents = await prisma.enterprise.findMany({ where: { playerId }, select: { id: true } });
  const entIds = ents.map((e) => e.id);
  const workshops = entIds.length > 0
    ? await prisma.workshop.findMany({ where: { enterpriseId: { in: entIds } }, select: { id: true } })
    : [];
  const wsIds = workshops.map((w) => w.id);
  const rentalOffers = await prisma.warehouseRentalOffer.findMany({ where: { ownerId: playerId }, select: { id: true } });
  const rentalOfferIds = rentalOffers.map((o) => o.id);

  await prisma.$transaction([
    prisma.marketOrder.deleteMany({ where: { playerId } }),
    prisma.enterpriseInventory.deleteMany({ where: { enterpriseId: { in: entIds } } }),
    prisma.playerInventory.deleteMany({ where: { playerId } }),
    prisma.financialTransaction.deleteMany({ where: { playerId } }),
    prisma.financialLog.deleteMany({ where: { playerId } }),
    prisma.dailySnapshot.deleteMany({ where: { playerId } }),
    ...(entIds.length > 0 ? [prisma.productionLog.deleteMany({ where: { enterpriseId: { in: entIds } } })] : []),
    // Заставні посилання на enterprise/ф'ючерс, які інакше заблокують видалення нижче
    prisma.loan.updateMany({
      where: { playerId, collateralEnterpriseId: { not: null } },
      data:  { collateralEnterpriseId: null, collateralReleased: true },
    }),
    prisma.loan.updateMany({
      where: { playerId, collateralForwardContractId: { not: null } },
      data:  { collateralForwardContractId: null },
    }),
    prisma.warehouseRentalSubscription.deleteMany({ where: { offerId: { in: rentalOfferIds } } }),
    prisma.warehouseRentalOffer.deleteMany({ where: { ownerId: playerId } }),
    prisma.pendingDelivery.deleteMany({ where: { playerId } }),
    prisma.replenishRule.deleteMany({ where: { playerId } }),
    prisma.constructionProject.deleteMany({ where: { enterpriseId: { in: entIds } } }),
    prisma.license.deleteMany({ where: { playerId } }),
    prisma.subsidyApplication.deleteMany({ where: { playerId } }),
    prisma.energyContract.deleteMany({ where: { playerId } }),
    prisma.securitySystem.deleteMany({ where: { playerId } }),
    prisma.farmMachinery.deleteMany({ where: { playerId } }),
    prisma.livestockHerd.deleteMany({ where: { playerId } }),
    prisma.grainForwardContract.deleteMany({ where: { playerId } }),
    prisma.b2bTransferAgreement.deleteMany({ where: { playerId } }),
    prisma.supplyRoute.deleteMany({ where: { playerId } }),
    prisma.regulatoryInspection.deleteMany({ where: { playerId } }),
    prisma.warehouse.deleteMany({ where: { playerId } }),
    prisma.office.deleteMany({ where: { playerId } }),
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
