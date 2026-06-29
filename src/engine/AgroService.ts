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
        licenses: { where: { type: 'ORGANIC_CERT', status: 'ACTIVE' }, select: { id: true } },
      },
    });

    let paid = 0;
    for (const farm of farms) {
      const totalArea = (farm.landPlot?.totalAreaM2 ?? 0) + farm.extraFieldAreaM2;
      if (totalArea < 100) continue; // мінімум 100 м² для субсидії

      const hasOrganic   = farm.licenses.length > 0;
      const subsRate     = SUBSIDY_PER_M2_PER_MONTH * (hasOrganic ? 1.15 : 1.0);
      const amount       = Math.round(totalArea * subsRate);
      if (amount <= 0) continue;

      const balBefore = await this.prisma.player.findUnique({ where: { id: farm.playerId }, select: { cashBalance: true } });
      const balanceBefore = new Decimal(balBefore?.cashBalance?.toString() ?? '0');
      const balanceAfter  = balanceBefore.plus(amount);
      const organicTag    = hasOrganic ? ' [+15% органік]' : '';

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
            description: `Агро-субсидія: ${farm.name} (${Math.round(totalArea)} м²)${organicTag}`,
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

  // ── 5. Деградація якості зерна без силосу ────────────────────────────────────
  /**
   * Кожен тік перевіряє AGRO_FARM без EQ-SILO в обладнанні.
   * Якщо є зерно (RM-WHEAT/RM-CORN/RM-SUNFL/RM-SUGBEET) — avgQuality -= 0.05, min 1.0.
   */
  async processGrainQualityDegradation(): Promise<void> {
    const GRAIN_SKUS = ['RM-WHEAT', 'RM-CORN', 'RM-SUNFL', 'RM-SUGBEET', 'RM-WHEAT-ORG', 'RM-CORN-ORG'];

    const farms = await this.prisma.enterprise.findMany({
      where: { type: 'AGRO_FARM', isOperational: true, isSeized: false },
      select: {
        id: true,
        workshops: {
          select: { equipment: { select: { name: true } } },
        },
        inventory: {
          select: { id: true, avgQuality: true, product: { select: { sku: true } } },
        },
      },
    });

    for (const farm of farms) {
      // Перевіряємо чи є хоч один EQ-SILO (за назвою, бо sku зберігається в name equipment)
      const hasSilo = farm.workshops.some(w =>
        w.equipment.some(eq => eq.name.includes('Силос') || eq.name.includes('EQ-SILO') || eq.name.includes('Grain Silo'))
      );
      if (hasSilo) continue;

      for (const inv of farm.inventory) {
        if (!GRAIN_SKUS.includes(inv.product.sku)) continue;
        if (inv.avgQuality <= 1.0) continue;

        const newQuality = Math.max(1.0, inv.avgQuality - 0.05);
        await this.prisma.enterpriseInventory.update({
          where: { id: inv.id },
          data:  { avgQuality: newQuality },
        });
      }
    }
  }

  // ── 6. Агро-ярмарок ──────────────────────────────────────────────────────────
  /**
   * Одноразовий продаж запасів зерна на ярмарку за referencePrice × FAIR_PREMIUM.
   * Можна викликати лише коли tickNumber % 20 === 0.
   * Повертає: { soldUnits, revenueUah }
   */
  static readonly FAIR_PREMIUM = 1.15;
  static readonly FAIR_GRAIN_SKUS = new Set(['RM-WHEAT', 'RM-CORN', 'RM-SUNFL', 'RM-SUGBEET', 'RM-WHEAT-ORG', 'RM-CORN-ORG']);

  async sellAtAgroFair(
    enterpriseId: string,
    playerId: string,
    skuToSell: string,
    quantityToSell: number,
  ): Promise<{ soldUnits: number; revenueUah: number }> {
    if (!AgroService.FAIR_GRAIN_SKUS.has(skuToSell)) {
      throw new Error('На ярмарку продається лише зерно');
    }

    const product = await this.prisma.product.findUnique({ where: { sku: skuToSell }, select: { id: true, nameUa: true } });
    if (!product) throw new Error('Товар не знайдено');

    const inv = await this.prisma.enterpriseInventory.findUnique({
      where: { enterpriseId_productId: { enterpriseId, productId: product.id } },
      select: { id: true, quantity: true },
    });
    if (!inv || inv.quantity < 0.001) throw new Error('Немає товару на складі');

    const actualQty = Math.min(Number(inv.quantity), quantityToSell);

    // Отримуємо середню referencePrice з NpcDemand
    const demand = await this.prisma.npcDemand.aggregate({
      where:   { productId: product.id },
      _avg:    { referencePrice: true },
    });
    const refPrice = Number(demand._avg.referencePrice ?? 0);
    if (refPrice <= 0) throw new Error('Немає ринкової ціни для цього товару');

    const fairPrice = refPrice * AgroService.FAIR_PREMIUM;
    const revenue   = Math.round(actualQty * fairPrice);

    const playerBal = await this.prisma.player.findUnique({ where: { id: playerId }, select: { cashBalance: true } });
    const balanceBefore = new Decimal(playerBal?.cashBalance?.toString() ?? '0');
    const balanceAfter  = balanceBefore.plus(revenue);

    await this.prisma.$transaction([
      this.prisma.enterpriseInventory.update({
        where: { id: inv.id },
        data:  { quantity: { decrement: actualQty } },
      }),
      this.prisma.player.update({
        where: { id: playerId },
        data:  { cashBalance: { increment: revenue } },
      }),
      this.prisma.financialTransaction.create({
        data: {
          playerId,
          type:         'MARKET_SALE',
          amountUah:    new Decimal(revenue),
          balanceBefore,
          balanceAfter,
          description:  `Агро-ярмарок: ${product.nameUa} × ${actualQty.toFixed(1)} (+15%)`,
        },
      }),
    ]);

    return { soldUnits: actualQty, revenueUah: revenue };
  }

  // ── Сезонна обробка: ґрунт, добриво, шкідники, гниття врожаю ───────────────
  /**
   * Викликається кожні 30 тіків (раз на сезон).
   * 1. Ґрунт деградує −0.1 без добрива, покращується +0.2 з добривом
   * 2. fertilizerTicksLeft зменшується на 30
   * 3. 12% шанс появи шкідників (pestDamageMult = 0.6)
   * 4. Незібраний врожай польових культур гниє (harvestAccumulated → 0)
   */
  async processSeasonalSoilAndPests(tickNumber: bigint): Promise<void> {
    const PEST_CHANCE      = 0.12;
    const PEST_MULT        = 0.6;

    const farms = await this.prisma.enterprise.findMany({
      where:  { type: 'AGRO_FARM', isOperational: true, isSeized: false },
      select: {
        id: true, playerId: true, name: true,
        landPlot: { select: { id: true, soilQuality: true, fertilizerTicksLeft: true, pestDamageMult: true } },
        workshops: { select: { id: true, harvestAccumulated: true } },
      },
    });

    for (const farm of farms) {
      const lp = farm.landPlot;
      if (!lp) continue;

      // 1+2. Soil & fertilizer
      const hasFert       = lp.fertilizerTicksLeft > 0;
      const soilDelta     = hasFert ? 0.2 : -0.1;
      const newSoil       = Math.max(1.0, Math.min(10.0, lp.soilQuality + soilDelta));
      const newFertTicks  = Math.max(0, lp.fertilizerTicksLeft - 30);

      // 3. Pests — spawn only if no active damage
      let newPestMult = lp.pestDamageMult;
      const pestSpawns = lp.pestDamageMult >= 1.0 && Math.random() < PEST_CHANCE;
      if (pestSpawns) newPestMult = PEST_MULT;

      await this.prisma.landPlot.update({
        where: { id: lp.id },
        // fieldOpsMask скидається щосезону — операції треба повторювати
        data:  { soilQuality: newSoil, fertilizerTicksLeft: newFertTicks, pestDamageMult: newPestMult, fieldOpsMask: 0 },
      });

      // Notifications
      if (pestSpawns && farm.playerId) {
        await this.prisma.notification.create({
          data: {
            playerId: farm.playerId,
            type:     'WARNING',
            title:    `Шкідники на фермі «${farm.name}»`,
            body:     'Нашестя попелиці! Врожайність −40%. Застосуйте пестицид у вкладці Поля.',
          },
        }).catch(() => {});
      }

      // 4. Harvest rot — clear accumulated field crops
      for (const ws of farm.workshops) {
        if (ws.harvestAccumulated >= 1) {
          await this.prisma.workshop.update({
            where: { id: ws.id },
            data:  { harvestAccumulated: 0 },
          });
          if (farm.playerId) {
            await this.prisma.notification.create({
              data: {
                playerId: farm.playerId,
                type:     'WARNING',
                title:    `Врожай згнив у «${farm.name}»`,
                body:     `${ws.harvestAccumulated.toFixed(0)} кг врожаю не зібрано до кінця сезону і згнило. Збирайте вчасно!`,
              },
            }).catch(() => {});
          }
        }
      }
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
