import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import type { EnergyBillingResult } from '../types';

export class EnergyBillingService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Calculates and charges energy consumption per city for one game-day tick.
   *
   * kWh/tick:
   *   enterprise.basePowerKwhPerTick  — always-on overhead
   *   workshop.basePowerKwhPerTick    — always-on per workshop
   *   equipment.energyConsumptionKw × 24h × utilisationRate
   *
   * Тариф (UAH/кВт·год) — Decimal.  Рахунок = Decimal × number → Decimal.
   */
  async calculateAndBillEnergy(
    playerId:              string,
    tickNumber:            bigint,
    utilisationByWorkshop: Map<string, number>,
  ): Promise<EnergyBillingResult[]> {
    const enterprises = await this.prisma.enterprise.findMany({
      where:   { playerId, isOperational: true },
      include: {
        workshops: { include: { equipment: true } },
        landPlot:  { include: { city: true } },
      },
    });

    // Зведення кВт·год по місту
    const kwhByCity = new Map<string, { cityId: string; kwh: number; tariff: Decimal }>();

    for (const ent of enterprises) {
      const city   = ent.landPlot.city;
      const tariff = new Decimal(city.energyTariffUah.toString());

      let kwhForEnt = ent.basePowerKwhPerTick;

      for (const ws of ent.workshops) {
        if (!ws.isActive) continue;
        kwhForEnt += ws.basePowerKwhPerTick;

        const utilisation = utilisationByWorkshop.get(ws.id) ?? 0;
        for (const eq of ws.equipment) {
          if (eq.isBroken) continue;
          // energyConsumptionKw × 24 год × utilisation = кВт·год/тік
          kwhForEnt += eq.energyConsumptionKw * 24 * utilisation;
        }
      }

      const existing = kwhByCity.get(city.id);
      if (existing) {
        existing.kwh += kwhForEnt;
      } else {
        kwhByCity.set(city.id, { cityId: city.id, kwh: kwhForEnt, tariff });
      }
    }

    if (kwhByCity.size === 0) return [];

    const results: EnergyBillingResult[] = [];

    // Баланс читається один раз і оновлюється послідовно через Decimal
    const player  = await this.prisma.player.findUniqueOrThrow({ where: { id: playerId } });
    let   balance = new Decimal(player.cashBalance.toString());

    for (const { cityId, kwh, tariff } of kwhByCity.values()) {
      // billUah = Decimal(tariff) × number(kwh) — результат Decimal
      const billUah = tariff.times(kwh);
      if (billUah.lessThan('0.01')) continue;

      const balanceBefore = balance;
      balance             = balance.minus(billUah);
      // Не дозволяємо від'ємний баланс (TickEngine вже перевіряє платоспроможність)
      if (balance.isNegative()) balance = new Decimal(0);

      await this.prisma.$transaction([
        this.prisma.energyBill.create({
          data: {
            playerId,
            cityId,
            tickNumber,
            consumptionKwh: kwh,
            tariffUah:      tariff,       // Decimal ✓
            totalUah:       billUah,      // Decimal ✓
            isPaid:         true,
          },
        }),
        this.prisma.player.update({
          where: { id: playerId },
          data:  { cashBalance: balance }, // Decimal ✓
        }),
        this.prisma.financialTransaction.create({
          data: {
            playerId,
            type:          'ENERGY_BILL',
            amountUah:     billUah.negated(),  // Decimal ✓
            balanceBefore,                      // Decimal ✓
            balanceAfter:  balance,             // Decimal ✓
            description:
              `Електроенергія: ${kwh.toFixed(2)} кВт·год × ₴${tariff.toFixed(4)}/кВт·год`,
            referenceId:   cityId,
          },
        }),
      ]);

      results.push({
        cityId,
        totalKwh:     kwh,
        tariffUah:    tariff,
        totalBillUah: billUah.toNumber(), // number для Result типу (display)
      });
    }

    return results;
  }

  /** Оцінка місячного рахунку для UI (без запису в БД). */
  async estimateMonthlyBillUah(playerId: string): Promise<number> {
    const enterprises = await this.prisma.enterprise.findMany({
      where:   { playerId, isOperational: true },
      include: {
        workshops: { include: { equipment: true } },
        landPlot:  { include: { city: true } },
      },
    });

    let total = new Decimal(0);

    for (const ent of enterprises) {
      const tariff = new Decimal(ent.landPlot.city.energyTariffUah.toString());
      let   kwh    = ent.basePowerKwhPerTick;

      for (const ws of ent.workshops) {
        if (!ws.isActive) continue;
        kwh += ws.basePowerKwhPerTick;
        for (const eq of ws.equipment) {
          if (eq.isBroken) continue;
          kwh += eq.energyConsumptionKw * 24 * 0.75; // 75% avg utilisation
        }
      }

      total = total.plus(tariff.times(kwh).times(30)); // 30 тиків/місяць
    }

    return total.toNumber();
  }
}
