import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const STARTING_GAME_CASH = 50_000;

// POST /api/player/reset
// Hard resets all player game progress inside a single transaction.
// Does NOT delete: User, Company record, UserLicense, premiumCoin, Syndicate membership.
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;

  const company = await prisma.company.findFirst({
    where : { ownerId: userId },
    select: { id: true },
  });
  if (!company) return NextResponse.json({ error: "Компанія не знайдена" }, { status: 404 });

  const companyId = company.id;

  await prisma.$transaction(async (tx) => {
    // ── 1. Collect IDs we need for targeted deletes ─────────────────────────
    const [enterprises, warehouses, contracts] = await Promise.all([
      tx.enterprise.findMany({ where: { companyId }, select: { id: true } }),
      tx.warehouse.findMany({ where: { companyId }, select: { id: true } }),
      tx.supplyContract.findMany({
        where: { OR: [{ sellerCompanyId: companyId }, { buyerCompanyId: companyId }] },
        select: { id: true },
      }),
    ]);

    const entIds      = enterprises.map((e) => e.id);
    const warehouseIds = warehouses.map((w) => w.id);
    const contractIds  = contracts.map((c) => c.id);

    // ── 2. Records that reference Enterprise (no cascade) ───────────────────
    if (entIds.length > 0) {
      await tx.tickEvent.deleteMany({ where: { enterpriseId: { in: entIds } } });
      await tx.retailSalesLog.deleteMany({ where: { enterpriseId: { in: entIds } } });
    }

    // ── 3. ContractExecution → SupplyContract ───────────────────────────────
    if (contractIds.length > 0) {
      await tx.contractExecution.deleteMany({ where: { contractId: { in: contractIds } } });
    }
    await tx.supplyContract.deleteMany({
      where: { OR: [{ sellerCompanyId: companyId }, { buyerCompanyId: companyId }] },
    });

    // ── 4. Routes & offers ───────────────────────────────────────────────────
    await tx.internalSupplyRoute.deleteMany({ where: { companyId } });
    await tx.marketOffer.deleteMany({ where: { sellerCompanyId: companyId } });

    // ── 5. Inventory ─────────────────────────────────────────────────────────
    if (entIds.length > 0) {
      await tx.inventory.deleteMany({ where: { enterpriseId: { in: entIds } } });
    }
    if (warehouseIds.length > 0) {
      await tx.inventory.deleteMany({ where: { warehouseId: { in: warehouseIds } } });
    }

    // ── 6. Warehouses ────────────────────────────────────────────────────────
    await tx.warehouse.deleteMany({ where: { companyId } });

    // ── 7. Financial history ─────────────────────────────────────────────────
    await tx.financialTransaction.deleteMany({ where: { companyId } });
    await tx.taxRecord.deleteMany({ where: { companyId } });

    // ── 8. Research ──────────────────────────────────────────────────────────
    await tx.companyResearch.deleteMany({ where: { companyId } });

    // ── 9. Notifications ─────────────────────────────────────────────────────
    await tx.notification.deleteMany({ where: { userId } });

    // ── 10. Enterprises (cascade: EnterpriseOffice → Workshop → ProductionLine
    //        → LineEquipment/LineWorker, + AutoReplenishRule, ShopSetting,
    //          EnterpriseProductionSlot, EnterpriseRoleSalary, TechResearch) ─
    await tx.enterprise.deleteMany({ where: { companyId } });

    // ── 11. Reset company stats ───────────────────────────────────────────────
    await tx.company.update({
      where: { id: companyId },
      data : { rating: 100, brandLevel: 1, totalAssets: 0 },
    });

    // ── 12. Reset CompanyTaxState ─────────────────────────────────────────────
    await tx.companyTaxState.upsert({
      where : { companyId },
      update: { balanceAtLastTax: 0, lastTaxedTick: 0, totalTaxPaid: 0, totalDutyPaid: 0 },
      create: { companyId },
    });

    // ── 13. Reset wallet (keep premiumCoin) ───────────────────────────────────
    await tx.userWallet.upsert({
      where : { userId },
      update: { gameCash: STARTING_GAME_CASH },
      create: { userId, gameCash: STARTING_GAME_CASH },
    });
  }, { timeout: 30_000 });

  return NextResponse.json({ ok: true });
}
