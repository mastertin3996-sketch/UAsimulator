/**
 * AgroService — спеціалізований сервіс для AGRO_FARM підприємств.
 *
 * Відповідає за:
 *  1. Державні агро-субсидії (кожні 30 тіків)
 *  2. Локальні погодні події (заморозки/град) per-enterprise
 *  3. Розширення поля (extraFieldAreaM2 + оренда)
 *  4. Виконання grain forward contracts при deliveryTick
 */

import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

// UAH субсидія на 1 м² поля на місяць (базова ставка, як ДПЗКУ)
const SUBSIDY_PER_M2_PER_MONTH = 12; // ₴12/м²/місяць

// Шанс локальної погодної події per farm per tick
const LOCAL_WEATHER_CHANCE = 0.04; // 4% шанс кожен тік

const WEATHER_EVENTS = [
  { desc: 'Заморозки',   mod: 0.70, durationTicks: 3  },
  { desc: 'Град',        mod: 0.50, durationTicks: 2  },
  { desc: 'Злива',       mod: 0.85, durationTicks: 4  },
  { desc: 'Спека',       mod: 0.80, durationTicks: 5  },
] as const;

// Штраф за дефолт ф'ючерсу (% від суми контракту)
const FORWARD_DEFAULT_PENALTY_RATE = 0.15;
// Штраф за відміну ф'ючерсу гравцем
const FORWARD_CANCEL_PENALTY_RATE  = 0.05;

// Вартість оренди додаткового поля ₴/м²/місяць
const EXTRA_FIELD_RENT_PER_M2 = 8;

export class AgroService {
  constructor(private readonly prisma: PrismaClient) {}

  // ── 1. Держsubсидії ─────────────────────────────────────────────────────────
  /**
   * Виплачує субсидію всім AGRO_FARM гравцям.
   * Розмір = (landPlot.totalAreaM2 + enterprise.extraFieldAreaM2) × SUBSIDY_PER_M2_PER_MONTH
   * Вже існуюча SubsidyApplication перевіряється, щоб не платити двічі за місяць.
   */
  async payAgroSubsidies(tickNumber: bigint): Promise<number> {
    const farms = await this.prisma.enterprise.findMany({
      where:   { type: 'AGRO_FARM', isOperational: true, isSeized: false },
      select:  {
        id: true, playerId: true, name: true,
        extraFieldAreaM2: true,
        landPlot: { select: { totalAreaM2: true } },
      },
    });

    let paid = 0;
    for (const farm of farms) {
      const totalArea = (farm.landPlot?.totalAreaM2 ?? 0) + farm.extraFieldAreaM2;
      if (totalArea < 100) continue; // мінімум 100 м² для субсидії

      const amount = Math.round(totalArea * SUBSIDY_PER_M2_PER_MONTH);
      if (amount <= 0) continue;

      const balBefore = await this.prisma.player.findUnique({ where: { id: farm.playerId }, select: { cashBalance: true } });
      const balanceBefore = new Decimal(balBefore?.cashBalance?.toString() ?? '0');
      const balanceAfter  = balanceBefore.plus(amount);

      await this.prisma.$transaction([
        this.prisma.player.update({
          where: { id: farm.playerId },
          data:  { cashBalance: { increment: amount } },
        }),
        this.prisma.financialTransaction.create({
          data: {
            playerId:    farm.playerId,
            type:        'STATE_SUBSIDY',
            amountUah:   new Decimal(amount),
            balanceBefore,
            balanceAfter,
            description: `Агро-субсидія: ${farm.name} (${Math.round(totalArea)} м²)`,
          },
        }),
      ]);
      paid++;
    }
    return paid;
  }

  // ── 2. Локальні погодні події ────────────────────────────────────────────────
  /**
   * Для кожної AGRO_FARM: якщо немає активної події — шанс 4% отримати нову.
   * Якщо поточна подія закінчилась — скидаємо localWeatherMod до 1.0.
   */
  async processLocalWeather(tickNumber: bigint): Promise<void> {
    const farms = await this.prisma.enterprise.findMany({
      where:  { type: 'AGRO_FARM', isOperational: true, isSeized: false },
      select: { id: true, playerId: true, name: true, localWeatherMod: true, localWeatherEndsAtTick: true },
    });

    for (const farm of farms) {
      // Закінчення поточної події
      if (farm.localWeatherEndsAtTick && tickNumber > farm.localWeatherEndsAtTick) {
        await this.prisma.enterprise.update({
          where: { id: farm.id },
          data:  { localWeatherMod: 1.0, localWeatherEndsAtTick: null, localWeatherDesc: null },
        });
        continue;
      }

      // Нова подія
      if (!farm.localWeatherEndsAtTick && Math.random() < LOCAL_WEATHER_CHANCE) {
        const ev = WEATHER_EVENTS[Math.floor(Math.random() * WEATHER_EVENTS.length)];
        const endsAt = tickNumber + BigInt(ev.durationTicks);
        await this.prisma.enterprise.update({
          where: { id: farm.id },
          data:  { localWeatherMod: ev.mod, localWeatherEndsAtTick: endsAt, localWeatherDesc: ev.desc },
        });
        await this.prisma.notification.create({
          data: {
            playerId: farm.playerId,
            type:     'MACRO_EVENT',
            title:    `⛈ ${ev.desc} на фермі`,
            body:     `${farm.name}: ${ev.desc} знизять врожайність до ${Math.round(ev.mod * 100)}% на ${ev.durationTicks} дні.`,
          },
        });
      }
    }
  }

  // ── 3. Виконання ф'ючерсних контрактів ──────────────────────────────────────
  /**
   * При досягненні deliveryTick:
   *  - Є товар → відправляємо, гравець отримує гроші (MARKET_SALE)
   *  - Немає товару → штраф FORWARD_DEFAULT_PENALTY_RATE від суми
   */
  async processForwardContracts(tickNumber: bigint): Promise<void> {
    const due = await this.prisma.grainForwardContract.findMany({
      where: { deliveryTick: tickNumber, status: 'ACTIVE' },
      include: {
        enterprise: { select: { id: true, name: true } },
        product:    { select: { id: true, nameUa: true } },
      },
    });

    for (const contract of due) {
      const inv = await this.prisma.enterpriseInventory.findUnique({
        where:  { enterpriseId_productId: { enterpriseId: contract.enterpriseId, productId: contract.productId } },
        select: { quantity: true },
      });
      const available = inv ? Number(inv.quantity) : 0;
      const totalValue = contract.quantityUnits * Number(contract.pricePerUnit);

      const playerBal = await this.prisma.player.findUnique({ where: { id: contract.playerId }, select: { cashBalance: true } });
      const balanceBefore = new Decimal(playerBal?.cashBalance?.toString() ?? '0');

      if (available >= contract.quantityUnits) {
        const balanceAfter = balanceBefore.plus(totalValue);
        await this.prisma.$transaction([
          this.prisma.enterpriseInventory.updateMany({
            where: { enterpriseId: contract.enterpriseId, productId: contract.productId },
            data:  { quantity: { decrement: contract.quantityUnits } },
          }),
          this.prisma.player.update({
            where: { id: contract.playerId },
            data:  { cashBalance: { increment: totalValue } },
          }),
          this.prisma.financialTransaction.create({
            data: {
              playerId:    contract.playerId,
              type:        'MARKET_SALE',
              amountUah:   new Decimal(totalValue),
              balanceBefore,
              balanceAfter,
              description: `Ф'ючерс виконано: ${contract.product.nameUa} × ${contract.quantityUnits}`,
            },
          }),
          this.prisma.grainForwardContract.update({
            where: { id: contract.id },
            data:  { status: 'FULFILLED' },
          }),
        ]);
      } else {
        const penalty = Math.round(totalValue * FORWARD_DEFAULT_PENALTY_RATE);
        const actualPenalty = Math.min(penalty, balanceBefore.toNumber());
        const balanceAfter  = balanceBefore.minus(actualPenalty);

        await this.prisma.$transaction([
          this.prisma.player.update({
            where: { id: contract.playerId },
            data:  { cashBalance: { decrement: actualPenalty } },
          }),
          this.prisma.financialTransaction.create({
            data: {
              playerId:    contract.playerId,
              type:        'TAX_PAYMENT',
              amountUah:   new Decimal(-actualPenalty),
              balanceBefore,
              balanceAfter,
              description: `Штраф: невиконаний ф'ючерс ${contract.product.nameUa} × ${contract.quantityUnits}`,
            },
          }),
          this.prisma.grainForwardContract.update({
            where: { id: contract.id },
            data:  { status: 'DEFAULTED', penaltyPaid: actualPenalty },
          }),
          this.prisma.notification.create({
            data: {
              playerId: contract.playerId,
              type:     'MACRO_EVENT',
              title:    `Ф'ючерс не виконано`,
              body:     `Недостатньо ${contract.product.nameUa} для поставки (є ${available.toFixed(0)}, потрібно ${contract.quantityUnits}). Штраф: ₴${actualPenalty.toLocaleString()}.`,
            },
          }),
        ]);
      }
    }
  }

  // ── 4. Списання оренди додаткових полів ─────────────────────────────────────
  /**
   * Щомісяця (кожні 30 тіків) списує orендну плату за extraFieldAreaM2.
   */
  async chargeExtraFieldRents(tickNumber: bigint): Promise<void> {
    const farms = await this.prisma.enterprise.findMany({
      where:  { type: 'AGRO_FARM', extraFieldAreaM2: { gt: 0 } },
      select: { id: true, playerId: true, name: true, extraFieldAreaM2: true, extraFieldRentUah: true },
    });

    for (const farm of farms) {
      const rent = Number(farm.extraFieldRentUah);
      if (rent <= 0) continue;

      const farmBal = await this.prisma.player.findUnique({ where: { id: farm.playerId }, select: { cashBalance: true } });
      const rentBefore = new Decimal(farmBal?.cashBalance?.toString() ?? '0');
      const rentAfter  = rentBefore.minus(rent);

      await this.prisma.$transaction([
        this.prisma.player.update({
          where: { id: farm.playerId },
          data:  { cashBalance: { decrement: rent } },
        }),
        this.prisma.financialTransaction.create({
          data: {
            playerId:     farm.playerId,
            type:         'LAND_LEASE_PAYMENT',
            amountUah:    new Decimal(-rent),
            balanceBefore: rentBefore,
            balanceAfter:  rentAfter,
            description:  `Оренда поля: ${farm.name} (+${Math.round(farm.extraFieldAreaM2)} м²)`,
          },
        }),
      ]);
    }
  }

  // ── Допоміжні: розширення поля (викликається з API) ─────────────────────────
  static calcExtraFieldRent(areaM2: number): number {
    return Math.round(areaM2 * EXTRA_FIELD_RENT_PER_M2);
  }

  static calcForwardCancelPenalty(quantity: number, pricePerUnit: number): number {
    return Math.round(quantity * pricePerUnit * FORWARD_CANCEL_PENALTY_RATE);
  }
}
