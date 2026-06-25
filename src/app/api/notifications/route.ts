import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const playerId = session.user.id;
  const { searchParams } = new URL(req.url);
  const unreadOnly = searchParams.get("unread") === "true";
  const take = Math.min(50, Number(searchParams.get("take") ?? 50));
  const skip = Number(searchParams.get("skip") ?? 0);

  // ── DB notifications ──────────────────────────────────────────────────────
  const [dbNotifs, dbUnreadCount, lastTick] = await Promise.all([
    prisma.notification.findMany({
      where:   { playerId },
      orderBy: { createdAt: "desc" },
      take:    take + skip,
      select:  { id: true, type: true, title: true, body: true, entityId: true, isRead: true, createdAt: true },
    }),
    prisma.notification.count({ where: { playerId, isRead: false } }),
    prisma.gameTick.findFirst({ orderBy: { tickNumber: "desc" }, select: { tickNumber: true } }),
  ]);

  const currentTick = Number(lastTick?.tickNumber ?? 0);
  const tickBigInt  = lastTick?.tickNumber ?? 0n;

  const enterprises = await prisma.enterprise.findMany({
    where:  { playerId },
    select: {
      id: true, name: true,
      employees: { where: { isOnStrike: true }, select: { id: true } },
      workshops: { select: { equipment: { where: { status: { in: ["WORN", "BROKEN"] } }, select: { id: true, name: true, status: true } } } },
      licenses:  { where: { expiresAtTick: { lt: tickBigInt + 5n } }, select: { id: true, type: true, expiresAtTick: true } },
    },
  });

  // ── Virtual notifications from live game state ────────────────────────────
  type VNotif = { id: string; type: string; title: string; body: string; entityId: string | null; isRead: boolean; createdAt: Date };
  const virtuals: VNotif[] = [];

  for (const ent of enterprises) {
    if (ent.employees.length > 0) {
      virtuals.push({ id: `v-strike-${ent.id}`, type: "STRIKE", isRead: false, entityId: ent.id, title: "Страйк на підприємстві", body: `На "${ent.name}" ${ent.employees.length} прац. оголосили страйк.`, createdAt: new Date() });
    }
    for (const ws of ent.workshops) {
      for (const eq of ws.equipment) {
        if (eq.status === "BROKEN") virtuals.push({ id: `v-broken-${eq.id}`, type: "EQUIPMENT_BROKEN", isRead: false, entityId: ent.id, title: "Обладнання поламано", body: `"${eq.name}" на "${ent.name}" потребує ремонту.`, createdAt: new Date() });
        else if (eq.status === "WORN") virtuals.push({ id: `v-worn-${eq.id}`, type: "EQUIPMENT_WORN", isRead: false, entityId: ent.id, title: "Знос обладнання", body: `"${eq.name}" на "${ent.name}" потребує ТО.`, createdAt: new Date() });
      }
    }
    for (const lic of ent.licenses) {
      const expiresIn = Number(lic.expiresAtTick) - currentTick;
      virtuals.push({ id: `v-lic-${lic.id}`, type: "LICENSE_EXPIRY", isRead: false, entityId: ent.id, title: expiresIn <= 0 ? "Ліцензія прострочена" : "Ліцензія закінчується", body: `Ліцензія ${lic.type} для "${ent.name}" ${expiresIn <= 0 ? "прострочена" : `закінчується через ${expiresIn} тіків`}.`, createdAt: new Date() });
    }
  }

  // Deduplicate virtuals against DB (skip if same entityId+type exists in DB)
  const dbKeys = new Set(dbNotifs.map((n) => `${n.type}:${n.entityId}`));
  const filteredVirtuals = virtuals.filter((v) => !dbKeys.has(`${v.type}:${v.entityId}`));

  // Merge sorted by date (DB notifs are already sorted desc)
  const merged = [...dbNotifs, ...filteredVirtuals].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const unreadCount = dbUnreadCount + filteredVirtuals.filter((v) => !v.isRead).length;

  const filtered = unreadOnly ? merged.filter((n) => !n.isRead) : merged;
  const paginated = filtered.slice(skip, skip + take);

  return NextResponse.json({
    notifications: paginated.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() })),
    total:         filtered.length,
    unreadCount,
  });
}
