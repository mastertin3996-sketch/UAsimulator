/**
 * RegulatoryInspectionService — рандомні державні перевірки підприємств.
 *
 * Кожні 20–40 тіків для кожного гравця (в середньому раз на 30 тіків):
 *  - Обирається підприємство рандомно
 *  - Тип перевірки: TAX | QUALITY | LABOR | FIRE_SAFETY
 *  - Оцінюємо порушення → результат PASSED | VIOLATION | SEVERE_VIOLATION
 *  - Штраф і тимчасове заморожування
 *
 * Гравці з creditScore ≥ 800 (whitelist) — перевірки автоматично PASSED.
 * Штраф → CreditScoreService.onRegulationFine().
 */

import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { CreditScoreService } from './CreditScoreService';

const INSPECTION_BASE_CHANCE = 1 / 30; // ~раз на 30 тіків на гравця
const INSPECTION_TYPES = ['TAX', 'QUALITY', 'LABOR', 'FIRE_SAFETY'] as const;
type InspectionType = typeof INSPECTION_TYPES[number];

const FINE_BASE: Record<InspectionType, number> = {
  TAX:         25_000,
  QUALITY:     15_000,
  LABOR:       20_000,
  FIRE_SAFETY: 10_000,
};

export class RegulatoryInspectionService {
  private readonly creditSvc: CreditScoreService;

  constructor(private readonly prisma: PrismaClient) {
    this.creditSvc = new CreditScoreService(prisma);
  }

  async processInspections(tickNumber: bigint): Promise<void> {
    const players = await this.prisma.player.findMany({
      where:  { isActive: true, isBankrupt: false, isNpcSeller: false },
      select: { id: true, creditScore: true },
    });

    for (const player of players) {
      if (Math.random() > INSPECTION_BASE_CHANCE) continue;

      // Whitelist: creditScore ≥ 800 пропускає автоматично
      if (CreditScoreService.isWhitelisted(player.creditScore ?? 500)) {
        await this.prisma.notification.create({
          data: {
            playerId: player.id,
            type:     'INFO',
            title:    '✓ Перевірка пройдена автоматично',
            body:     `Ваш рейтинг ділової репутації (${player.creditScore}/1000) дозволяє пропускати регуляторні перевірки.`,
          },
        });
        continue;
      }

      // Обираємо рандомне підприємство
      const enterprises = await this.prisma.enterprise.findMany({
        where:  { playerId: player.id, isSeized: false },
        select: {
          id: true, name: true, type: true,
          employees: { select: { accruedSalaryUah: true } },
          inventory: { select: { avgQuality: true, quantity: true } },
        },
      });
      if (enterprises.length === 0) continue;

      const ent = enterprises[Math.floor(Math.random() * enterprises.length)];
      const type = INSPECTION_TYPES[Math.floor(Math.random() * INSPECTION_TYPES.length)];

      const { result, fineUah, freezeTicks, findings } = this.evaluate(type, ent);

      await this.prisma.regulatoryInspection.create({
        data: {
          playerId:       player.id,
          enterpriseId:   ent.id,
          inspectionType: type,
          result,
          fineUah:        new Decimal(fineUah),
          freezeTicks,
          findings,
          conductedAtTick: tickNumber,
          isPaid:          fineUah === 0,
        },
      });

      if (result === 'PASSED') {
        await this.prisma.notification.create({
          data: {
            playerId: player.id,
            type:     'INFO',
            title:    `✓ Перевірка пройдена: ${ent.name}`,
            body:     `Тип: ${this.typeUa(type)}. Порушень не виявлено.`,
          },
        });
        await this.creditSvc.adjust(player.id, 3); // +3 за успішну перевірку
        continue;
      }

      // Застосовуємо штраф та заморозку
      const playerBal = await this.prisma.player.findUnique({
        where: { id: player.id }, select: { cashBalance: true },
      });
      const balBefore = new Decimal(playerBal?.cashBalance?.toString() ?? '0');
      const actualFine = Math.min(fineUah, balBefore.toNumber());
      const balAfter  = balBefore.minus(actualFine);

      await this.prisma.$transaction([
        this.prisma.player.update({
          where: { id: player.id },
          data:  { cashBalance: { decrement: actualFine } },
        }),
        this.prisma.financialTransaction.create({
          data: {
            playerId:    player.id,
            type:        'REGULATORY_INSPECTION_FEE',
            amountUah:   new Decimal(-actualFine),
            balanceBefore: balBefore,
            balanceAfter:  balAfter,
            description: `Штраф: ${this.typeUa(type)}, ${ent.name} (${result})`,
          },
        }),
        this.prisma.notification.create({
          data: {
            playerId: player.id,
            type:     'WARNING',
            title:    `⚠ Порушення: ${ent.name}`,
            body:     `Перевірка: ${this.typeUa(type)}. Штраф ₴${actualFine.toLocaleString()}. ${findings}`,
          },
        }),
        ...(freezeTicks > 0 ? [
          this.prisma.enterprise.update({
            where: { id: ent.id },
            data:  {
              isFrozenByInspection:    true,
              inspectionFreezeUntilTick: tickNumber + BigInt(freezeTicks),
            },
          }),
        ] : []),
      ]);
      await this.creditSvc.onRegulationFine(player.id, result === 'SEVERE_VIOLATION');
    }
  }

  private evaluate(
    type: InspectionType,
    ent: {
      employees: { accruedSalaryUah: Decimal | number }[];
      inventory: { avgQuality: number; quantity: Decimal | number }[];
    },
  ): { result: string; fineUah: number; freezeTicks: number; findings: string } {
    const rng = Math.random();

    if (type === 'TAX') {
      if (rng < 0.6) return { result: 'PASSED', fineUah: 0, freezeTicks: 0, findings: 'Документи в порядку' };
      const fine = Math.round(FINE_BASE.TAX * (0.5 + rng));
      const severe = rng > 0.85;
      return { result: severe ? 'SEVERE_VIOLATION' : 'VIOLATION', fineUah: fine, freezeTicks: severe ? 5 : 0, findings: 'Виявлено розбіжності в звітності' };
    }

    if (type === 'QUALITY') {
      const lowQualityItems = ent.inventory.filter(i => i.avgQuality < 4 && Number(i.quantity) > 0.1).length;
      if (lowQualityItems === 0 || rng < 0.5) return { result: 'PASSED', fineUah: 0, freezeTicks: 0, findings: 'Якість продукції відповідає нормам' };
      const fine = Math.round(FINE_BASE.QUALITY * (1 + lowQualityItems * 0.3));
      return { result: 'VIOLATION', fineUah: fine, freezeTicks: 3, findings: `Товар низької якості (${lowQualityItems} позиції нижче норми)` };
    }

    if (type === 'LABOR') {
      const unpaidSalaries = ent.employees.reduce((s, e) => s + Number(e.accruedSalaryUah), 0);
      if (unpaidSalaries < 5000 || rng < 0.4) return { result: 'PASSED', fineUah: 0, freezeTicks: 0, findings: 'Трудові права дотримані' };
      const fine = Math.round(Math.max(FINE_BASE.LABOR, unpaidSalaries * 0.5));
      return { result: 'VIOLATION', fineUah: fine, freezeTicks: 0, findings: `Заборгованість по зарплаті: ₴${Math.round(unpaidSalaries).toLocaleString()}` };
    }

    // FIRE_SAFETY — рандомна
    if (rng < 0.65) return { result: 'PASSED', fineUah: 0, freezeTicks: 0, findings: 'Засоби пожежогасіння в нормі' };
    const severe = rng > 0.9;
    return {
      result: severe ? 'SEVERE_VIOLATION' : 'VIOLATION',
      fineUah: Math.round(FINE_BASE.FIRE_SAFETY * (severe ? 2 : 1)),
      freezeTicks: severe ? 7 : 0,
      findings: severe ? 'Критичні порушення пожежної безпеки' : 'Незначні порушення пожежної безпеки',
    };
  }

  private typeUa(t: InspectionType): string {
    return { TAX: 'Податкова', QUALITY: 'Якість продукції', LABOR: 'Трудова інспекція', FIRE_SAFETY: 'Пожежна безпека' }[t];
  }
}
