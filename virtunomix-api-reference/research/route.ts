import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  calcPointsPerTick,
  ticksToNextLevel,
  qualityBonus,
  inputMultiplier,
  tradeCapacityMultiplier,
  logisticsRentMultiplier,
  SECTOR_META,
} from "@/lib/research-utils";

// GET /api/research — стан R&D по всіх підприємствах гравця
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;

  const enterprises = await prisma.enterprise.findMany({
    where  : { company: { ownerId: userId }, isActive: true },
    include: {
      enterpriseType: { select: { category: true, name: true } },
      city          : { select: { name: true } },
      techResearch  : true,
    },
    orderBy: { createdAt: "asc" },
  });

  const wallet = await prisma.userWallet.findUnique({ where: { userId } });
  const gcBalance = Number(wallet?.gameCash ?? 0);
  const pcBalance = Number(wallet?.premiumCoin ?? 0);

  let totalGCPerTick = 0;
  let totalPCPerTick = 0;

  const researches = enterprises.map((e) => {
    const row    = e.techResearch;
    const sector = e.enterpriseType.category;
    const meta   = SECTOR_META.find((m) => m.sector === sector)!;

    const level      = row?.currentLevel      ?? 0;
    const progress   = Number(row?.researchProgress ?? 0);
    const required   = Number(row?.pointsRequired   ?? 1000);
    const gcPerTick  = Number(row?.investmentGC     ?? 0);
    const pcPerTick  = Number(row?.investmentPC     ?? 0);
    const isActive   = row?.isActive ?? false;
    const ptsPerTick = calcPointsPerTick(gcPerTick, pcPerTick);

    totalGCPerTick += gcPerTick;
    totalPCPerTick += pcPerTick;

    return {
      enterpriseId  : e.id,
      enterpriseName: e.name,
      cityName      : e.city.name,
      sector,
      sectorName    : meta?.name ?? sector,
      icon          : meta?.icon ?? "🏭",
      color         : meta?.color ?? "blue",
      effects       : meta?.effects ?? [],
      currentLevel    : level,
      researchProgress: progress,
      pointsRequired  : required,
      progressPct     : required > 0 ? Math.min(100, (progress / required) * 100) : 100,
      investmentGC    : gcPerTick,
      investmentPC    : pcPerTick,
      isActive,
      ptsPerTick,
      ticksToNext     : ticksToNextLevel(progress, required, ptsPerTick),
      qualityBonus    : qualityBonus(level),
      inputMultiplier : sector === "PRODUCTION" && level > 0 ? inputMultiplier(level) : null,
      tradeMultiplier : sector === "TRADE"       && level > 0 ? tradeCapacityMultiplier(level) : null,
      logisticsMultiplier: sector === "LOGISTICS" && level > 0 ? logisticsRentMultiplier(level) : null,
    };
  });

  return NextResponse.json({ researches, gcBalance, pcBalance, totalGCPerTick, totalPCPerTick });
}
