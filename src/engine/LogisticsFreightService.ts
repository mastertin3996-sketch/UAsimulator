/**
 * LogisticsFreightService — ринок вантажних перевезень.
 *
 * NPC щодня (кожні 5 тіків) розміщують замовлення на доставку зерна/товарів
 * між містами. Гравець з LOGISTICS_HUB може прийняти замовлення і через 3 тіки
 * отримує виручку.
 *
 * Тариф: базовий ₴12/od/місто-дистанція (замовлення на 50–500 одиниць).
 * Гравець з кількома LOGISTICS_HUB отримує бонус +20% до тарифу.
 */

import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const BASE_TARIFF_PER_UNIT = 12;   // ₴/od
const ORDER_TTL_TICKS      = 10;   // замовлення дійсне 10 тіків
const DELIVERY_DELAY_TICKS = 3;    // доставка займе 3 тіки

const FREIGHT_PRODUCTS = [
  'RM-WHEAT', 'RM-CORN', 'RM-SUNFL', 'SF-COMPOST',
  'FG-BREAD', 'FG-MEAT', 'FG-HONEY',
  'CM-CEMENT', 'CM-TIMBER',
];

export class LogisticsFreightService {
  constructor(private readonly prisma: PrismaClient) {}

  // ── 1. Генерація замовлень NPC ───────────────────────────────────────────────
  async generateNpcOrders(tickNumber: bigint): Promise<number> {
    const cities = await this.prisma.city.findMany({ select: { id: true } });
    if (cities.length < 2) return 0;

    let created = 0;
    const numOrders = 3 + Math.floor(Math.random() * 3); // 3–5 замовлень

    for (let i = 0; i < numOrders; i++) {
      const shuffled = [...cities].sort(() => Math.random() - 0.5);
      const fromCity = shuffled[0];
      const toCity   = shuffled[1];
      if (fromCity.id === toCity.id) continue;

      const sku = FREIGHT_PRODUCTS[Math.floor(Math.random() * FREIGHT_PRODUCTS.length)];
      const qty = 50 + Math.floor(Math.random() * 451); // 50–500
      const tariff = new Decimal(
        Math.round(BASE_TARIFF_PER_UNIT * (0.8 + Math.random() * 0.5) * 100) / 100
      );
      const totalValue = tariff.times(qty);

      await this.prisma.logisticsFreightOrder.create({
        data: {
          productSku:   sku,
          quantityUnits: qty,
          fromCityId:   fromCity.id,
          toCityId:     toCity.id,
          tariffPerUnit: tariff,
          totalValueUah: totalValue,
          status:        'OPEN',
          postedAtTick:  tickNumber,
          expiresAtTick: tickNumber + BigInt(ORDER_TTL_TICKS),
        },
      });
      created++;
    }

    // Прибираємо прострочені відкриті замовлення
    await this.prisma.logisticsFreightOrder.updateMany({
      where: { status: 'OPEN', expiresAtTick: { lt: tickNumber } },
      data:  { status: 'EXPIRED' },
    });

    return created;
  }

  // ── 2. Завершення прийнятих замовлень ────────────────────────────────────────
  async processCompletedOrders(tickNumber: bigint): Promise<void> {
    // Замовлення зі статусом ACCEPTED, у яких acceptedAtTick + DELAY <= tickNumber
    const dueOrders = await this.prisma.logisticsFreightOrder.findMany({
      where: {
        status: 'ACCEPTED',
        acceptedAtTick: { lte: tickNumber - BigInt(DELIVERY_DELAY_TICKS) },
      },
      select: { id: true, carrierId: true, totalValueUah: true },
    });

    for (const order of dueOrders) {
      if (!order.carrierId) continue;
      const revenue = new Decimal(order.totalValueUah.toString());

      const player = await this.prisma.player.findUnique({
        where: { id: order.carrierId }, select: { cashBalance: true },
      });
      if (!player) continue;

      const balBefore = new Decimal(player.cashBalance.toString());
      const balAfter  = balBefore.plus(revenue);

      await this.prisma.$transaction([
        this.prisma.logisticsFreightOrder.update({
          where: { id: order.id },
          data:  { status: 'COMPLETED', completedAtTick: tickNumber },
        }),
        this.prisma.player.update({
          where: { id: order.carrierId },
          data:  { cashBalance: { increment: revenue } },
        }),
        this.prisma.financialTransaction.create({
          data: {
            playerId:    order.carrierId,
            type:        'NPC_SALE',
            amountUah:   revenue,
            balanceBefore: balBefore,
            balanceAfter:  balAfter,
            description: `Вантажне перевезення виконано: ₴${Number(revenue).toLocaleString()}`,
          },
        }),
      ]);
    }
  }

  // ── 3. Гравець бере замовлення ───────────────────────────────────────────────
  async acceptOrder(
    orderId:   string,
    carrierId: string,
    tickNumber: bigint,
  ): Promise<{ revenueUah: number; deliveryTick: bigint }> {
    const order = await this.prisma.logisticsFreightOrder.findFirst({
      where: { id: orderId, status: 'OPEN' },
    });
    if (!order) throw new Error('Замовлення не знайдено або вже прийнято');

    // Перевіряємо чи має гравець LOGISTICS_HUB
    const hub = await this.prisma.enterprise.findFirst({
      where: { playerId: carrierId, type: 'LOGISTICS_HUB', isOperational: true },
    });
    if (!hub) throw new Error('Потрібен активний LOGISTICS_HUB');

    // Бонус +20% якщо є 2+ хабів
    const hubCount = await this.prisma.enterprise.count({
      where: { playerId: carrierId, type: 'LOGISTICS_HUB', isOperational: true },
    });
    const bonusMult = hubCount >= 2 ? 1.20 : 1.0;
    const revenue = new Decimal(order.totalValueUah.toString()).times(bonusMult);
    const deliveryTick = tickNumber + BigInt(DELIVERY_DELAY_TICKS);

    await this.prisma.logisticsFreightOrder.update({
      where: { id: orderId },
      data: {
        carrierId,
        status:          'ACCEPTED',
        acceptedAtTick:  tickNumber,
        totalValueUah:   revenue, // оновлюємо з бонусом
      },
    });

    return { revenueUah: Number(revenue), deliveryTick };
  }
}
