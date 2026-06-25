import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

const SCRAP_RATE = 0.15; // 15% of total construction cost returned as scrap value

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;
  const { id: enterpriseId } = await params;

  const enterprise = await prisma.enterprise.findUnique({
    where: { id: enterpriseId },
    include: {
      constructionProjects: { where: { status: "COMPLETED" }, select: { totalCostUah: true } },
    },
  });

  if (!enterprise) return NextResponse.json({ error: "Підприємство не знайдено" }, { status: 404 });
  if (enterprise.playerId !== playerId) return NextResponse.json({ error: "Не ваше підприємство" }, { status: 403 });
  if (enterprise.isCollateral) return NextResponse.json({ error: "Підприємство є заставою за кредитом — погасіть кредит перш ніж демонтувати" }, { status: 409 });
  if (enterprise.isSeized) return NextResponse.json({ error: "Підприємство арештоване" }, { status: 409 });

  // Calculate scrap value from completed construction costs
  const totalConstructionUah = enterprise.constructionProjects.reduce(
    (sum, p) => sum.plus(p.totalCostUah),
    new Prisma.Decimal(0),
  );
  const scrapValueUah = totalConstructionUah.times(SCRAP_RATE);

  const lastTick = await prisma.gameTick.findFirst({ orderBy: { tickNumber: "desc" }, select: { tickNumber: true } });
  const currentTick = lastTick?.tickNumber ?? 1n;

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Cancel any active M&A listing for this enterprise
      await tx.maDeal.updateMany({
        where:  { targetEnterpriseId: enterpriseId, status: "PENDING" },
        data:   { status: "CANCELED", canceledAtTick: currentTick },
      });

      // 2. Cancel supply routes
      await tx.supplyRoute.deleteMany({
        where: {
          OR: [
            { sourceEnterpriseId: enterpriseId },
            { targetEnterpriseId: enterpriseId },
          ],
        },
      });

      // 3. Cancel auto-replenish rules
      await tx.replenishRule.deleteMany({ where: { enterpriseId } });

      // 4. Cancel active construction projects
      await tx.constructionProject.deleteMany({ where: { enterpriseId } });

      // 5. Dismiss employees
      await tx.employee.deleteMany({ where: { enterpriseId } });

      // 6. Clear inventory
      await tx.enterpriseInventory.deleteMany({ where: { enterpriseId } });

      // 7. Delete workshops
      await tx.workshop.deleteMany({ where: { enterpriseId } });

      // 8. Delete energy contracts
      await tx.energyContract.deleteMany({ where: { enterpriseId } });

      // 9. Delete security system
      await tx.securitySystem.deleteMany({ where: { enterpriseId } });

      // 10. Delete licenses
      await tx.license.deleteMany({ where: { enterpriseId } });

      // 11. Delete subsidy applications
      await tx.subsidyApplication.deleteMany({ where: { enterpriseId } });

      // 12. Delete warehouse
      await tx.warehouse.deleteMany({ where: { enterpriseId } });

      // 13. Delete office
      await tx.office.deleteMany({ where: { enterpriseId } });

      // 14. Free up land area
      await tx.landPlot.update({
        where: { id: enterprise.landPlotId },
        data:  { usedAreaM2: { decrement: enterprise.footprintM2 } },
      });

      // 15. Credit scrap value to player
      if (scrapValueUah.greaterThan(0)) {
        const player = await tx.player.findUniqueOrThrow({
          where:  { id: playerId },
          select: { cashBalance: true },
        });
        const balBefore = new Prisma.Decimal(player.cashBalance.toString());
        const balAfter  = balBefore.plus(scrapValueUah);

        await tx.player.update({
          where: { id: playerId },
          data:  { cashBalance: balAfter },
        });
        await tx.financialTransaction.create({
          data: {
            playerId,
            type:          "MA_SALE_REVENUE",
            amountUah:     scrapValueUah,
            balanceBefore: balBefore,
            balanceAfter:  balAfter,
            description:   `Лом від демонтажу: ${enterprise.name}`,
            referenceId:   enterpriseId,
          },
        });
      }

      // 16. Delete the enterprise itself
      await tx.enterprise.delete({ where: { id: enterpriseId } });
    });

    return NextResponse.json({
      ok: true,
      scrapValueUah: Number(scrapValueUah),
      enterpriseName: enterprise.name,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Помилка";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
