/**
 * GET /api/logistics/freight
 * Повертає відкриті вантажні замовлення + нещодавно виконані гравцем.
 *
 * POST /api/logistics/freight
 * Body: { orderId }
 * Гравець (з LOGISTICS_HUB) бере замовлення.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LogisticsFreightService } from "@/engine/LogisticsFreightService";

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const currentTick = await prisma.gameTick.findFirst({
    orderBy: { tickNumber: "desc" }, select: { tickNumber: true },
  });
  const tick = BigInt(currentTick?.tickNumber ?? 0);

  const cities = await prisma.city.findMany({ select: { id: true, nameUa: true } });
  const cityMap = new Map(cities.map(c => [c.id, c.nameUa]));

  const [openOrders, myOrders] = await Promise.all([
    prisma.logisticsFreightOrder.findMany({
      where:   { status: "OPEN", expiresAtTick: { gte: tick } },
      orderBy: { totalValueUah: "desc" },
      take: 20,
    }),
    prisma.logisticsFreightOrder.findMany({
      where:   { carrierId: session.user.id, status: { in: ["ACCEPTED", "COMPLETED"] } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const hasHub = await prisma.enterprise.findFirst({
    where: { playerId: session.user.id, type: "LOGISTICS_HUB", isOperational: true },
    select: { id: true },
  });

  const fmt = (o: typeof openOrders[0]) => ({
    id:           o.id,
    productSku:   o.productSku,
    quantityUnits: o.quantityUnits,
    fromCity:     cityMap.get(o.fromCityId) ?? o.fromCityId,
    toCity:       cityMap.get(o.toCityId)   ?? o.toCityId,
    tariffPerUnit: Number(o.tariffPerUnit),
    totalValueUah: Number(o.totalValueUah),
    expiresAtTick: o.expiresAtTick.toString(),
    status:        o.status,
    acceptedAtTick: o.acceptedAtTick?.toString() ?? null,
    completedAtTick: o.completedAtTick?.toString() ?? null,
  });

  return NextResponse.json({
    hasHub: !!hasHub,
    openOrders: openOrders.map(fmt),
    myOrders:   myOrders.map(fmt),
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });

  const currentTick = await prisma.gameTick.findFirst({
    orderBy: { tickNumber: "desc" }, select: { tickNumber: true },
  });
  const tick = BigInt(currentTick?.tickNumber ?? 0);

  try {
    const svc = new LogisticsFreightService(prisma);
    const result = await svc.acceptOrder(body.orderId, session.user.id, tick);
    return NextResponse.json({
      message:      `Замовлення прийнято. Виручка ₴${result.revenueUah.toLocaleString()} буде нарахована через 3 дні.`,
      revenueUah:   result.revenueUah,
      deliveryTick: result.deliveryTick.toString(),
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Помилка" }, { status: 400 });
  }
}
