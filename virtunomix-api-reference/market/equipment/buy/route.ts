/**
 * POST /api/market/equipment/buy
 *
 * Купівля обладнання у NPC та негайне встановлення на виробничу лінію.
 *
 * Body: {
 *   listingId : string;  — id запису NpcEquipmentListing
 *   lineId    : string;  — id ProductionLine, куди встановлюємо обладнання
 * }
 *
 * Логіка:
 *   1. Перевіряємо право власності на лінію (session → company → enterprise → workshop → line).
 *   2. Перевіряємо тип цеху лінії відповідає workshopType обладнання.
 *   3. Перевіряємо баланс гравця.
 *   4. $transaction:
 *      a. Списуємо GC з гаманця.
 *      b. Видаляємо старе LineEquipment (якщо є) — воно втрачається.
 *      c. Створюємо новий LineEquipment з wearPercent з listing.
 *      d. Зменшуємо stockQty listing; якщо stockQty = 0 — видаляємо.
 *      e. Логуємо фінансову транзакцію.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth }    from "@/lib/auth";
import { prisma }  from "@/lib/prisma";
import { cache }   from "@/lib/cache";
import { EQUIPMENT_TYPES } from "@/lib/equipment-config";
import { TransactionType } from "@/generated/prisma/client";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { listingId?: string; lineId?: string };
  const { listingId, lineId } = body;

  if (!listingId || !lineId) {
    return NextResponse.json({ error: "listingId та lineId — обов'язкові" }, { status: 400 });
  }

  // ── Паралельно вантажимо listing, лінію та гаманець ─────────────────────

  const [listing, line, wallet] = await Promise.all([
    prisma.npcEquipmentListing.findUnique({
      where : { id: listingId },
      select: { id: true, equipmentTypeId: true, priceGc: true, stockQty: true,
                wearPercent: true, expiresAt: true, cityId: true },
    }),
    prisma.productionLine.findUnique({
      where  : { id: lineId },
      include: {
        workshop: {
          select: {
            type    : true,
            officeId: true,
            office  : {
              select: {
                enterpriseId: true,
                enterprise  : {
                  select: {
                    companyId: true,
                    company  : { select: { ownerId: true } },
                  },
                },
              },
            },
          },
        },
        equipment: { select: { id: true }, take: 1 },
      },
    }),
    prisma.userWallet.findUnique({ where: { userId: session.user.id } }),
  ]);

  // ── Валідації ────────────────────────────────────────────────────────────

  if (!listing) {
    return NextResponse.json({ error: "Пропозицію не знайдено" }, { status: 404 });
  }
  if (listing.expiresAt < new Date()) {
    return NextResponse.json({ error: "Термін дії пропозиції вичерпано" }, { status: 410 });
  }
  if (listing.stockQty <= 0) {
    return NextResponse.json({ error: "Обладнання вже розпродано" }, { status: 409 });
  }

  if (!line) {
    return NextResponse.json({ error: "Виробничу лінію не знайдено" }, { status: 404 });
  }

  const owner = line.workshop.office.enterprise.company.ownerId;
  if (owner !== session.user.id) {
    return NextResponse.json({ error: "Лінія не належить вам" }, { status: 403 });
  }

  const spec = EQUIPMENT_TYPES[listing.equipmentTypeId];
  if (!spec) {
    return NextResponse.json({ error: "Невідомий тип обладнання" }, { status: 400 });
  }

  // Перевіряємо сумісність: тип цеху має відповідати
  if (line.workshop.type !== spec.workshopType) {
    return NextResponse.json(
      { error: `Обладнання призначене для цеху типу «${spec.workshopType}», а цей цех — «${line.workshop.type}»` },
      { status: 422 },
    );
  }

  const price   = Number(listing.priceGc);
  const balance = Number(wallet?.gameCash ?? 0);
  if (balance < price) {
    return NextResponse.json(
      { error: `Недостатньо GC. Потрібно: ${price.toLocaleString("uk-UA")} GC, є: ${balance.toLocaleString("uk-UA")} GC` },
      { status: 402 },
    );
  }

  // ── Отримуємо поточний тік для installedTick ─────────────────────────────
  const lastTick = await prisma.gameTick.findFirst({
    orderBy: { tickNumber: "desc" },
    select : { tickNumber: true },
  });
  const currentTick = lastTick?.tickNumber ?? 1;

  const companyId  = line.workshop.office.enterprise.companyId;
  const balanceAfter = balance - price;

  // ── Атомна транзакція ─────────────────────────────────────────────────────
  await prisma.$transaction(async (tx) => {
    // 1. Списати GC (NPC = game sink, нікому не зараховуємо)
    await tx.userWallet.update({
      where: { userId: session.user!.id },
      data : { gameCash: { decrement: price } },
    });

    // 2. Видалити старе обладнання на лінії (якщо є)
    const existingEquipId = line.equipment[0]?.id;
    if (existingEquipId) {
      await tx.lineEquipment.deleteMany({ where: { lineId } });
    }

    // 3. Встановити нове обладнання
    await tx.lineEquipment.create({
      data: {
        lineId         : lineId,
        equipmentTypeId: listing.equipmentTypeId,
        wearPercent    : listing.wearPercent,
        installedTick  : currentTick,
      },
    });

    // 4. Зменшити запас listing або видалити
    if (listing.stockQty <= 1) {
      await tx.npcEquipmentListing.delete({ where: { id: listingId } });
    } else {
      await tx.npcEquipmentListing.update({
        where: { id: listingId },
        data : { stockQty: { decrement: 1 } },
      });
    }

    // 5. Фінансовий лог
    await tx.financialTransaction.create({
      data: {
        companyId,
        type        : TransactionType.MAINTENANCE,
        currency    : "GAME_CASH",
        amount      : -price,
        balanceAfter,
        description : `Купівля обладнання «${spec.name}» у NPC → лінія ${line.name}`,
      },
    });
  }, { timeout: 15_000 });

  cache.invalidatePrefix("equip-market:");

  return NextResponse.json({
    ok            : true,
    installed     : {
      equipmentTypeId: listing.equipmentTypeId,
      name           : spec.name,
      workshopType   : spec.workshopType,
      wearPercent    : listing.wearPercent,
      lineId,
      lineName       : line.name,
    },
    priceGc       : price,
    balanceAfter,
  });
}
