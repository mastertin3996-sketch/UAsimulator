import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// UAeconomy has no Notification model; generate virtual notifications from game state
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;
  const { searchParams } = new URL(req.url);
  const unreadOnly = searchParams.get("unread") === "true";
  const take = Math.min(50, Number(searchParams.get("take") ?? 50));
  const skip = Number(searchParams.get("skip") ?? 0);

  const lastTick = await prisma.gameTick.findFirst({
    orderBy: { tickNumber: "desc" }, select: { tickNumber: true },
  });
  const currentTick = Number(lastTick?.tickNumber ?? 0);

  const enterprises = await prisma.enterprise.findMany({
    where: { playerId },
    select: {
      id: true, name: true,
      employees: { where: { isOnStrike: true }, select: { id: true } },
      workshops: {
        select: {
          equipment: {
            where: { status: { in: ["WORN", "BROKEN"] } },
            select: { id: true, name: true, status: true },
          },
        },
      },
      licenses: {
        where: { expiresAtTick: { lt: currentTick + 5 } },
        select: { id: true, type: true, expiresAtTick: true },
      },
    },
  });

  // Filled market orders in last 30 ticks
  const filledOrders = await prisma.marketOrder.findMany({
    where: { playerId, status: { in: ["FILLED", "PARTIALLY_FILLED"] }, type: "SELL" },
    orderBy: { filledAt: "desc" },
    take: 10,
    select: { id: true, product: { select: { nameUa: true } }, quantityFilled: true, filledAt: true },
  });

  const notifications: {
    id: string; type: string; title: string; body: string;
    enterpriseId: string | null; isRead: boolean; createdAt: string;
  }[] = [];

  for (const ent of enterprises) {
    if (ent.employees.length > 0) {
      notifications.push({
        id: `strike-${ent.id}`, type: "STRIKE", isRead: false,
        title: "Страйк на підприємстві",
        body: `На "${ent.name}" ${ent.employees.length} прац. оголосили страйк.`,
        enterpriseId: ent.id,
        createdAt: new Date().toISOString(),
      });
    }
    for (const ws of ent.workshops) {
      for (const eq of ws.equipment) {
        if (eq.status === "BROKEN") {
          notifications.push({
            id: `broken-${eq.id}`, type: "EQUIPMENT_BROKEN", isRead: false,
            title: "Обладнання поламано",
            body: `"${eq.name}" на "${ent.name}" потребує ремонту.`,
            enterpriseId: ent.id,
            createdAt: new Date().toISOString(),
          });
        } else if (eq.status === "WORN") {
          notifications.push({
            id: `worn-${eq.id}`, type: "EQUIPMENT_WORN", isRead: false,
            title: "Знос обладнання",
            body: `"${eq.name}" на "${ent.name}" потребує ТО.`,
            enterpriseId: ent.id,
            createdAt: new Date().toISOString(),
          });
        }
      }
    }
    for (const lic of ent.licenses) {
      const expiresIn = Number(lic.expiresAtTick) - currentTick;
      notifications.push({
        id: `lic-${lic.id}`, type: "LICENSE_EXPIRY", isRead: false,
        title: expiresIn <= 0 ? "Ліцензія прострочена" : "Ліцензія закінчується",
        body: `Ліцензія ${lic.type} для "${ent.name}" ${expiresIn <= 0 ? "прострочена" : `закінчується через ${expiresIn} тіків`}.`,
        enterpriseId: ent.id,
        createdAt: new Date().toISOString(),
      });
    }
  }

  for (const order of filledOrders) {
    if (order.filledAt) {
      notifications.push({
        id: `filled-${order.id}`, type: "MARKET_FILLED", isRead: true,
        title: "Оферту виконано",
        body: `Продано ${order.quantityFilled.toFixed(0)} од. "${order.product.nameUa}".`,
        enterpriseId: null,
        createdAt: order.filledAt.toISOString(),
      });
    }
  }

  const filtered  = unreadOnly ? notifications.filter((n) => !n.isRead) : notifications;
  const paginated = filtered.slice(skip, skip + take);
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return NextResponse.json({ notifications: paginated, total: filtered.length, unreadCount });
}
