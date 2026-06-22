import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cities = await prisma.city.findMany({
    select: {
      id: true, name: true, nameUa: true, region: true,
      population: true, wageCoefficient: true,
      wageBaselineUah: true, energyTariffUah: true,
      demandCoefficient: true, landPriceCoeff: true,
      latitude: true, longitude: true,
      _count: { select: { landPlots: { where: { status: "AVAILABLE" } } } },
    },
    orderBy: { population: "desc" },
  });

  return NextResponse.json({
    cities: cities.map((c) => ({
      id: c.id, name: c.name, nameUa: c.nameUa, region: c.region,
      population: c.population,
      wageBaselineUah: Number(c.wageBaselineUah),
      energyTariffUah: Number(c.energyTariffUah),
      wageCoefficient: c.wageCoefficient,
      demandCoefficient: c.demandCoefficient,
      landPriceCoeff: c.landPriceCoeff,
      latitude: c.latitude, longitude: c.longitude,
      availablePlots: c._count.landPlots,
    })),
  });
}
