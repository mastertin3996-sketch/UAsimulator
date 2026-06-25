import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StateRegulationService } from "@/engine/StateRegulationService";
import { LicenseType } from "@prisma/client";

const LICENSE_FEE: Record<LicenseType, number> = {
  AGRO_PERMIT:           15_000,
  MANUFACTURING_LICENSE: 45_000,
  RETAIL_PERMIT:          8_000,
};

const LICENSE_DURATION_TICKS = 30;

const LICENSE_NAME: Record<LicenseType, string> = {
  AGRO_PERMIT:           "Агро-дозвіл",
  MANUFACTURING_LICENSE: "Ліцензія виробника",
  RETAIL_PERMIT:         "Торговий дозвіл",
};

const ENTERPRISE_LICENSE: Record<string, LicenseType> = {
  AGRO_FARM:       "AGRO_PERMIT",
  FOOD_PROCESSING: "AGRO_PERMIT",
  TEXTILE_FACTORY: "MANUFACTURING_LICENSE",
  RETAIL_STORE:    "RETAIL_PERMIT",
};

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;

  const [enterprises, lastTick, player] = await Promise.all([
    prisma.enterprise.findMany({
      where: { playerId, isOperational: true },
      select: {
        id: true, name: true, type: true,
        licenses: {
          where: { status: { in: ["ACTIVE", "EXPIRED"] } },
          orderBy: { expiresAtTick: "desc" },
          take: 1,
        },
      },
    }),
    prisma.gameTick.findFirst({ orderBy: { tickNumber: "desc" } }),
    prisma.player.findUnique({ where: { id: playerId }, select: { cashBalance: true } }),
  ]);

  const currentTick = Number(lastTick?.tickNumber ?? 0n);

  const items = enterprises
    .filter((e) => ENTERPRISE_LICENSE[e.type])
    .map((e) => {
      const licType   = ENTERPRISE_LICENSE[e.type];
      const existing  = e.licenses[0];
      const expiresAt = existing ? Number(existing.expiresAtTick) : null;
      const ticksLeft = expiresAt !== null ? expiresAt - currentTick : null;
      const status    = !existing
        ? "NONE"
        : existing.status === "EXPIRED" || (ticksLeft !== null && ticksLeft <= 0)
        ? "EXPIRED"
        : ticksLeft !== null && ticksLeft <= 5
        ? "EXPIRING_SOON"
        : "ACTIVE";

      return {
        enterpriseId:   e.id,
        enterpriseName: e.name,
        enterpriseType: e.type,
        licenseType:    licType,
        licenseName:    LICENSE_NAME[licType],
        fee:            LICENSE_FEE[licType],
        durationTicks:  LICENSE_DURATION_TICKS,
        licenseId:      existing?.id ?? null,
        status,
        expiresAtTick:  expiresAt,
        ticksLeft,
        currentTick,
      };
    });

  return NextResponse.json({
    items,
    cashBalance: Number(player?.cashBalance ?? 0),
    currentTick,
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;
  const { enterpriseId, licenseType } = await req.json();

  if (!enterpriseId || !licenseType) {
    return NextResponse.json({ error: "enterpriseId і licenseType обов'язкові" }, { status: 400 });
  }

  if (!Object.values(LicenseType).includes(licenseType)) {
    return NextResponse.json({ error: "Невідомий тип ліцензії" }, { status: 400 });
  }

  try {
    const svc    = new StateRegulationService(prisma);
    const result = await svc.purchaseOrRenewLicense(playerId, enterpriseId, licenseType as LicenseType);
    return NextResponse.json({
      ok:           true,
      renewed:      result.renewed,
      expiresAtTick: Number(result.expiresAtTick),
      feePaid:      Number(result.feePaidUah),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Помилка";
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}
