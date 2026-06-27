/**
 * GET /api/energy/exchange
 * Повертає статистику продажу надлишкової сонячної енергії для підприємств гравця.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const enterprises = await prisma.enterprise.findMany({
    where:  { playerId: session.user.id, energySourceType: "SOLAR_AUTONOMOUS" },
    select: {
      id: true, name: true, type: true,
      solarCapacityKw: true, batteryCapacityKwh: true, currentBatteryKwh: true,
      energySoldKwhTotal: true,
      landPlot: { select: { city: { select: { energyTariffUah: true, nameUa: true } } } },
    },
  });

  const FEED_IN_RATE = 0.6; // 60% від тарифу

  const result = enterprises.map(ent => {
    const tariff     = Number(ent.landPlot.city.energyTariffUah);
    const feedIn     = tariff * FEED_IN_RATE;
    const soldKwh    = ent.energySoldKwhTotal;
    const soldRevUah = soldKwh * feedIn;
    const batPct     = Number(ent.batteryCapacityKwh) > 0
      ? (Number(ent.currentBatteryKwh) / Number(ent.batteryCapacityKwh)) * 100
      : 0;

    return {
      id:              ent.id,
      name:            ent.name,
      type:            ent.type,
      city:            ent.landPlot.city.nameUa,
      solarKw:         Number(ent.solarCapacityKw),
      batteryKwh:      Number(ent.batteryCapacityKwh),
      currentBatKwh:   Number(ent.currentBatteryKwh),
      batPct:          Math.round(batPct),
      tariffUah:       tariff,
      feedInRate:      FEED_IN_RATE,
      feedInUah:       feedIn,
      soldKwhTotal:    soldKwh,
      soldRevenueUah:  Math.round(soldRevUah),
    };
  });

  const totalSoldKwh    = result.reduce((s, e) => s + e.soldKwhTotal, 0);
  const totalRevUah     = result.reduce((s, e) => s + e.soldRevenueUah, 0);

  return NextResponse.json({ enterprises: result, totalSoldKwh, totalRevUah });
}
