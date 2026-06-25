import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MacroEventType } from "@prisma/client";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "mastertin3996@gmail.com";

// GET /api/macro-events — active macro events (public, all players)
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [events, lastTick] = await Promise.all([
    prisma.macroEvent.findMany({
      where:   { status: "ACTIVE" },
      orderBy: { startTick: "desc" },
    }),
    prisma.gameTick.findFirst({ orderBy: { tickNumber: "desc" }, select: { tickNumber: true } }),
  ]);

  const currentTick = Number(lastTick?.tickNumber ?? 0);

  // Resolve city names
  const cityIds = [...new Set([
    ...events.filter(e => e.affectedCityId).map(e => e.affectedCityId!),
    ...events.filter(e => e.affectedFromCityId).map(e => e.affectedFromCityId!),
    ...events.filter(e => e.affectedToCityId).map(e => e.affectedToCityId!),
  ])];
  const cities = cityIds.length > 0
    ? await prisma.city.findMany({ where: { id: { in: cityIds } }, select: { id: true, nameUa: true } })
    : [];
  const cityMap = Object.fromEntries(cities.map(c => [c.id, c.nameUa]));

  return NextResponse.json({
    currentTick,
    events: events.map(e => ({
      id:          e.id,
      type:        e.type,
      description: e.description,
      startTick:   Number(e.startTick),
      endTick:     Number(e.endTick),
      ticksLeft:   Math.max(0, Number(e.endTick) - currentTick),
      cityName:    e.affectedCityId ? cityMap[e.affectedCityId] : null,
      fromCity:    e.affectedFromCityId ? cityMap[e.affectedFromCityId] : null,
      toCity:      e.affectedToCityId   ? cityMap[e.affectedToCityId]   : null,
      demandMultiplier: e.demandMultiplier,
    })),
  });
}

// POST /api/macro-events — GM only: trigger macro event manually
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.email !== ADMIN_EMAIL) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({})) as {
    type?:              string;
    durationTicks?:     number;
    cityId?:            string;
    fromCityId?:        string;
    toCityId?:          string;
    demandMultiplier?:  number;
  };

  if (!body.type) return NextResponse.json({ error: "type обов'язковий" }, { status: 400 });

  const validTypes = ["POWER_OUTAGE", "LOGISTICS_BOTTLENECK", "GRAIN_MARKET_BOOM"];
  if (!validTypes.includes(body.type)) {
    return NextResponse.json({ error: `type має бути одним з: ${validTypes.join(", ")}` }, { status: 400 });
  }

  const lastTick = await prisma.gameTick.findFirst({ orderBy: { tickNumber: "desc" }, select: { tickNumber: true } });
  const currentTick = lastTick?.tickNumber ?? 1n;
  const duration    = BigInt(body.durationTicks ?? 5);

  let description = "";
  switch (body.type as MacroEventType) {
    case "POWER_OUTAGE":
      description = body.cityId
        ? `Аварійне відключення електроенергії в місті. Підприємства сплачують +₴20 000/тік.`
        : "Загальне відключення електроенергії.";
      break;
    case "LOGISTICS_BOTTLENECK":
      description = "Затримки на транспортному маршруті. Час доставки +2 тіки.";
      break;
    case "GRAIN_MARKET_BOOM":
      description = `Ціновий спалах на зернові. Агросектор: +${Math.round(((body.demandMultiplier ?? 1.35) - 1) * 100)}% виручки.`;
      break;
  }

  const event = await prisma.macroEvent.create({
    data: {
      type:              body.type as MacroEventType,
      status:            "ACTIVE",
      affectedCityId:    body.cityId     ?? null,
      affectedFromCityId: body.fromCityId ?? null,
      affectedToCityId:   body.toCityId   ?? null,
      demandMultiplier:  body.demandMultiplier ?? 1.35,
      startTick:         currentTick,
      endTick:           currentTick + duration,
      description,
    },
  });

  return NextResponse.json({ ok: true, id: event.id, endTick: Number(event.endTick) });
}
