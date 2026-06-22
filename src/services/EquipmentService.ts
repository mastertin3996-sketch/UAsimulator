import { PrismaClient, EquipmentStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import {
  WEAR_THRESHOLDS,
  WORN_FAILURE_CHANCE_PER_TICK,
  MAINTENANCE_PENALTY_PER_MONTH,
} from '../constants/economic';
import type { DegradationResult } from '../types';

const { NEW_MAX, WORN_MIN } = WEAR_THRESHOLDS;

function wearToStatus(wear: number): EquipmentStatus {
  if (wear >= 1.0)    return 'BROKEN';
  if (wear >= WORN_MIN) return 'WORN';
  if (wear >= NEW_MAX)  return 'OPERATIONAL';
  return 'NEW';
}

/** Штраф за відсутність ТО: множник wearRate зростає на 25% за кожен місяць без обслуговування. */
function maintenanceMultiplier(lastMaintenanceAt: Date, nowMs: number): number {
  const monthsElapsed = (nowMs - lastMaintenanceAt.getTime()) / (1000 * 60 * 60 * 24 * 30);
  return 1 + MAINTENANCE_PENALTY_PER_MONTH * Math.max(0, monthsElapsed - 1);
}

export class EquipmentService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Накопичує знос (wearAndTear) для всього активного обладнання гравця.
   * Завантаження цеху передається із ProductionService.
   */
  async processDegradation(
    playerId:              string,
    utilisationByWorkshop: Map<string, number>,
  ): Promise<DegradationResult[]> {
    const workshops = await this.prisma.workshop.findMany({
      where:   { isActive: true, enterprise: { playerId, isOperational: true } },
      include: { equipment: true },
    });

    const results: DegradationResult[] = [];
    const now = Date.now();

    for (const ws of workshops) {
      const utilisation = utilisationByWorkshop.get(ws.id) ?? 0;

      for (const eq of ws.equipment) {
        if (eq.isBroken) continue;

        const maintMult = maintenanceMultiplier(eq.lastMaintenanceAt, now);
        const increment = eq.wearRatePerTick * utilisation * maintMult;
        const newWear   = Math.min(1.0, eq.wearAndTear + increment);

        let newStatus     = wearToStatus(newWear);
        let failedSuddenly = false;

        // Раптовий збій: якщо WORN і вийшло за випадком
        if (newStatus === 'WORN' && Math.random() < WORN_FAILURE_CHANCE_PER_TICK) {
          newStatus      = 'BROKEN';
          failedSuddenly = true;
        }

        const isBroken = newStatus === 'BROKEN';

        await this.prisma.equipment.update({
          where: { id: eq.id },
          data:  { wearAndTear: newWear, status: newStatus, isBroken },
        });

        results.push({
          equipmentId:    eq.id,
          wearBefore:     eq.wearAndTear,
          wearAfter:      newWear,
          statusBefore:   eq.status,
          statusAfter:    newStatus,
          failedSuddenly,
        });
      }
    }

    return results;
  }

  /**
   * Планове ТО: знижує wearAndTear на 0.40 (40 пп), оновлює lastMaintenanceAt.
   */
  async performMaintenance(equipmentId: string, playerId: string): Promise<void> {
    const eq = await this.prisma.equipment.findUniqueOrThrow({
      where:   { id: equipmentId },
      include: { workshop: { include: { enterprise: true } } },
    });
    if (eq.workshop.enterprise.playerId !== playerId) throw new Error('Not owner');

    const cost            = new Decimal(eq.maintenanceCostUah.toString());
    const newWear         = Math.max(0, eq.wearAndTear - 0.40);
    const newStatus       = wearToStatus(newWear);

    const player        = await this.prisma.player.findUniqueOrThrow({ where: { id: playerId } });
    const balanceBefore = new Decimal(player.cashBalance.toString());

    if (balanceBefore.lessThan(cost)) throw new Error('Insufficient funds for maintenance');

    const balanceAfter = balanceBefore.minus(cost);

    await this.prisma.$transaction([
      this.prisma.equipment.update({
        where: { id: equipmentId },
        data:  { wearAndTear: newWear, status: newStatus, isBroken: false, lastMaintenanceAt: new Date() },
      }),
      this.prisma.player.update({
        where: { id: playerId },
        data:  { cashBalance: balanceAfter },      // Decimal ✓
      }),
      this.prisma.financialTransaction.create({
        data: {
          playerId,
          type:          'MAINTENANCE_COST',
          amountUah:     cost.negated(),            // Decimal ✓
          balanceBefore,                            // Decimal ✓
          balanceAfter,                             // Decimal ✓
          description:   `ТО: ${eq.name} (знос ${eq.wearAndTear.toFixed(2)} → ${newWear.toFixed(2)})`,
          referenceId:   equipmentId,
        },
      }),
    ]);
  }

  /**
   * Аварійний ремонт BROKEN-обладнання.
   * Вартість = 2× планового ТО. Знос скидається до 0.45 (статус OPERATIONAL).
   */
  async repairBroken(equipmentId: string, playerId: string): Promise<void> {
    const eq = await this.prisma.equipment.findUniqueOrThrow({
      where:   { id: equipmentId },
      include: { workshop: { include: { enterprise: true } } },
    });
    if (eq.workshop.enterprise.playerId !== playerId) throw new Error('Not owner');
    if (!eq.isBroken) throw new Error('Equipment is not broken');

    const cost          = new Decimal(eq.maintenanceCostUah.toString()).times(2);
    const newWear       = 0.45; // OPERATIONAL zone
    const newStatus     = wearToStatus(newWear); // → OPERATIONAL

    const player        = await this.prisma.player.findUniqueOrThrow({ where: { id: playerId } });
    const balanceBefore = new Decimal(player.cashBalance.toString());

    if (balanceBefore.lessThan(cost)) throw new Error('Insufficient funds for repair');

    const balanceAfter = balanceBefore.minus(cost);

    await this.prisma.$transaction([
      this.prisma.equipment.update({
        where: { id: equipmentId },
        data:  { wearAndTear: newWear, status: newStatus, isBroken: false, lastMaintenanceAt: new Date() },
      }),
      this.prisma.player.update({
        where: { id: playerId },
        data:  { cashBalance: balanceAfter },       // Decimal ✓
      }),
      this.prisma.financialTransaction.create({
        data: {
          playerId,
          type:          'MAINTENANCE_COST',
          amountUah:     cost.negated(),             // Decimal ✓
          balanceBefore,                             // Decimal ✓
          balanceAfter,                              // Decimal ✓
          description:   `Аварійний ремонт: ${eq.name}`,
          referenceId:   equipmentId,
        },
      }),
    ]);
  }

  /**
   * Множник виробничого виходу цеху на основі стану обладнання.
   *   BROKEN → 0.0 | WORN → 0.5 × (1 − wear) | решта → (1 − wear)
   * Повертає 0.0–1.0.
   */
  workshopEquipmentFactor(
    equipment: Array<{ status: EquipmentStatus; wearAndTear: number; isBroken: boolean }>,
  ): number {
    if (equipment.length === 0) return 0;
    const total = equipment.reduce((sum, eq) => {
      if (eq.isBroken || eq.status === 'BROKEN') return sum;
      const healthFactor = 1 - eq.wearAndTear;
      return sum + (eq.status === 'WORN' ? healthFactor * 0.5 : healthFactor);
    }, 0);
    return total / equipment.length;
  }

  /**
   * Фактор якості цеху 0–10, похідний від workshopEquipmentFactor.
   */
  workshopQualityFactor(
    equipment: Array<{ status: EquipmentStatus; wearAndTear: number; isBroken: boolean }>,
  ): number {
    return this.workshopEquipmentFactor(equipment) * 10;
  }
}
