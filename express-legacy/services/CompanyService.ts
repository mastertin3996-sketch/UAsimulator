import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import {
  CONSTRUCTION_COST_PER_M2,
  CONSTRUCTION_TICKS_PER_100M2,
} from '../constants/economic';
import type {
  RegisterOfficeDto,
  AcquireLandDto,
  BuildEnterpriseDto,
  InstallEquipmentDto,
} from '../dto/company.dto';
import {
  InsufficientFundsError,
  OfficeRequiredError,
  LandLimitExceededError,
  LandNotAvailableError,
  WorkshopCapacityExceededError,
  ForbiddenError,
  NotFoundError,
  AppError,
} from '../errors/AppError';

/**
 * Площа підлоги (м²), яку займає одна одиниця обладнання.
 * Використовується для перевірки вмісту цеху без окремого поля у схемі Equipment.
 */
const EQUIPMENT_UNIT_FOOTPRINT_M2 = 30;

/** Кількість місяців оренди, які вносяться авансом при реєстрації офісу методом RENT. */
const RENT_UPFRONT_MONTHS = 3;

export class CompanyService {
  constructor(private readonly prisma: PrismaClient) {}

  // ══════════════════════════════════════════════════════════════════════════
  // POST /company/office/register
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Реєструє адміністративний офіс гравця у місті.
   * Офіс — обов'язкова умова для будь-яких виробничих операцій у місті.
   *
   * BUY:  списує вартість будівлі (CONSTRUCTION_COST_PER_M2['OFFICE'] × sizeM2)
   * RENT: списує RENT_UPFRONT_MONTHS місяців авансу
   */
  async registerOffice(
    playerId: string,
    dto: RegisterOfficeDto,
  ): Promise<{ enterpriseId: string; officeId: string }> {
    const landPlot = await this.prisma.landPlot
      .findUniqueOrThrow({
        where:   { id: dto.landPlotId },
        include: { city: true },
      })
      .catch(() => { throw new NotFoundError('LandPlot', dto.landPlotId); });

    if (landPlot.playerId !== playerId) {
      throw new ForbiddenError('Land plot is not owned or leased by this player');
    }
    if (landPlot.status === 'AVAILABLE') {
      throw new AppError(
        'Land plot must be acquired (BUY/LEASE) before building on it',
        422,
        'LAND_NOT_ACQUIRED',
      );
    }

    const existingOffice = await this.prisma.office.findUnique({
      where: { playerId_cityId: { playerId, cityId: landPlot.cityId } },
    });
    if (existingOffice) {
      throw new AppError(
        `Player already has an office in city '${landPlot.city.nameUa}'`,
        422,
        'OFFICE_ALREADY_EXISTS',
        { cityId: landPlot.cityId },
      );
    }

    const available = landPlot.totalAreaM2 - landPlot.usedAreaM2;
    if (dto.sizeM2 > available) {
      throw new LandLimitExceededError(dto.landPlotId, available, dto.sizeM2);
    }

    const upfront: Decimal = dto.method === 'RENT'
      ? new Decimal((dto.monthlyRentUah ?? 0) * RENT_UPFRONT_MONTHS)
      : new Decimal(CONSTRUCTION_COST_PER_M2['OFFICE'] * dto.sizeM2);

    const player  = await this.prisma.player.findUniqueOrThrow({ where: { id: playerId } });
    const balance = new Decimal(player.cashBalance.toString());
    if (balance.lessThan(upfront)) {
      throw new InsufficientFundsError(upfront.toNumber(), balance.toNumber());
    }

    return this.prisma.$transaction(async tx => {
      const enterprise = await tx.enterprise.create({
        data: {
          playerId,
          landPlotId:       dto.landPlotId,
          type:             'OFFICE',
          name:             `Офіс – ${landPlot.city.nameUa}`,
          footprintM2:      dto.sizeM2,
          totalFloorAreaM2: dto.sizeM2,
          isOperational:    true,
        },
      });

      const office = await tx.office.create({
        data: {
          playerId,
          cityId:        landPlot.cityId,
          enterpriseId:  enterprise.id,
          sizeM2:        dto.sizeM2,
          monthlyRentUah: dto.method === 'RENT'
            ? new Decimal(dto.monthlyRentUah ?? 0)
            : new Decimal(0),
          isOperational: true,
        },
      });

      await tx.landPlot.update({
        where: { id: dto.landPlotId },
        data:  { usedAreaM2: { increment: dto.sizeM2 } },
      });

      await tx.player.update({
        where: { id: playerId },
        data:  { cashBalance: { decrement: upfront } },
      });

      return { enterpriseId: enterprise.id, officeId: office.id };
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // POST /company/land/acquire
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Купує або орендує земельну ділянку.
   *
   * BUY:   списує purchasePriceUah, статус → OWNED
   * LEASE: списує 2 місяці авансу, статус → LEASED, встановлює leaseStartDate
   */
  async acquireLand(playerId: string, dto: AcquireLandDto): Promise<void> {
    const landPlot = await this.prisma.landPlot
      .findUniqueOrThrow({ where: { id: dto.landPlotId } })
      .catch(() => { throw new NotFoundError('LandPlot', dto.landPlotId); });

    if (landPlot.status !== 'AVAILABLE') {
      throw new LandNotAvailableError(dto.landPlotId, landPlot.status);
    }

    let cost: Decimal;
    let newStatus: 'OWNED' | 'LEASED';

    if (dto.method === 'BUY') {
      if (!landPlot.purchasePriceUah) {
        throw new AppError('This land plot is not listed for purchase', 422, 'NOT_FOR_SALE');
      }
      cost      = new Decimal(landPlot.purchasePriceUah.toString());
      newStatus = 'OWNED';
    } else {
      if (!landPlot.monthlyLeaseCostUah) {
        throw new AppError('This land plot is not available for lease', 422, 'NOT_FOR_LEASE');
      }
      cost      = new Decimal(landPlot.monthlyLeaseCostUah.toString()).times(2);
      newStatus = 'LEASED';
    }

    const player  = await this.prisma.player.findUniqueOrThrow({ where: { id: playerId } });
    const balance = new Decimal(player.cashBalance.toString());
    if (balance.lessThan(cost)) {
      throw new InsufficientFundsError(cost.toNumber(), balance.toNumber());
    }

    await this.prisma.$transaction([
      this.prisma.landPlot.update({
        where: { id: dto.landPlotId },
        data: {
          playerId,
          status:        newStatus,
          leaseStartDate: dto.method === 'LEASE' ? new Date() : undefined,
          purchasedAt:    dto.method === 'BUY'   ? new Date() : undefined,
        },
      }),
      this.prisma.player.update({
        where: { id: playerId },
        data:  { cashBalance: { decrement: cost } },
      }),
    ]);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // POST /company/enterprise/build
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Запускає будівництво підприємства.
   *
   * Передумови:
   *  1. Гравець має активний офіс у тому ж місті (cityId через LandPlot)
   *  2. На ділянці вистачає вільної площі (totalAreaM2 − usedAreaM2 ≥ footprintM2)
   *  3. На рахунку достатньо коштів (CONSTRUCTION_COST_PER_M2 × totalFloorAreaM2)
   *
   * Підприємство створюється як isOperational=false; стає операційним після
   * завершення ConstructionProject (обробляється TickEngine).
   */
  async buildEnterprise(
    playerId: string,
    dto: BuildEnterpriseDto,
  ): Promise<{ enterpriseId: string; constructionProjectId: string }> {
    const landPlot = await this.prisma.landPlot
      .findUniqueOrThrow({
        where:   { id: dto.landPlotId },
        include: { city: true },
      })
      .catch(() => { throw new NotFoundError('LandPlot', dto.landPlotId); });

    if (landPlot.playerId !== playerId) {
      throw new ForbiddenError('Land plot is not owned or leased by this player');
    }

    // ── Перевірка офісу ───────────────────────────────────────────────────
    const office = await this.prisma.office.findUnique({
      where: { playerId_cityId: { playerId, cityId: landPlot.cityId } },
    });
    if (!office?.isOperational) {
      throw new OfficeRequiredError(landPlot.cityId);
    }

    // ── Перевірка площі ───────────────────────────────────────────────────
    const availableM2 = landPlot.totalAreaM2 - landPlot.usedAreaM2;
    if (dto.footprintM2 > availableM2) {
      throw new LandLimitExceededError(dto.landPlotId, availableM2, dto.footprintM2);
    }

    // ── Перевірка балансу ─────────────────────────────────────────────────
    const costPerM2        = CONSTRUCTION_COST_PER_M2[dto.type as string] ?? 10_000;
    const constructionCost = new Decimal(costPerM2 * dto.totalFloorAreaM2);
    const player           = await this.prisma.player.findUniqueOrThrow({ where: { id: playerId } });
    const balance          = new Decimal(player.cashBalance.toString());
    if (balance.lessThan(constructionCost)) {
      throw new InsufficientFundsError(constructionCost.toNumber(), balance.toNumber());
    }

    const ticksPer100  = CONSTRUCTION_TICKS_PER_100M2[dto.type as string] ?? 7;
    const totalTicks   = Math.max(1, Math.ceil((dto.totalFloorAreaM2 / 100) * ticksPer100));

    return this.prisma.$transaction(async tx => {
      const enterprise = await tx.enterprise.create({
        data: {
          playerId,
          landPlotId:       dto.landPlotId,
          type:             dto.type,
          name:             dto.name,
          footprintM2:      dto.footprintM2,
          totalFloorAreaM2: dto.totalFloorAreaM2,
          isOperational:    false,
        },
      });

      const project = await tx.constructionProject.create({
        data: {
          enterpriseId:  enterprise.id,
          name:          `Будівництво ${dto.name}`,
          status:        'IN_PROGRESS',
          totalCostUah:  constructionCost,
          paidCostUah:   constructionCost,  // списано авансом
          ticksRequired: totalTicks,
          ticksRemaining: totalTicks,
          targetType:    'ENTERPRISE',
          targetId:      enterprise.id,
          footprintM2:   dto.footprintM2,
          startedAt:     new Date(),
        },
      });

      await tx.landPlot.update({
        where: { id: dto.landPlotId },
        data:  { usedAreaM2: { increment: dto.footprintM2 } },
      });

      await tx.player.update({
        where: { id: playerId },
        data:  { cashBalance: { decrement: constructionCost } },
      });

      return { enterpriseId: enterprise.id, constructionProjectId: project.id };
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // POST /company/workshop/equipment
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Купує та встановлює обладнання в цех.
   *
   * Обмеження площі підлоги:
   *   Кожна вже встановлена одиниця займає EQUIPMENT_UNIT_FOOTPRINT_M2 м².
   *   Нова (footprintM2 м²) + поточне використання ≤ workshop.footprintM2.
   *
   * @throws WorkshopCapacityExceededError якщо площа перевищена
   * @throws InsufficientFundsError        якщо бракує коштів
   */
  async installEquipment(playerId: string, dto: InstallEquipmentDto): Promise<string> {
    const workshop = await this.prisma.workshop
      .findUniqueOrThrow({
        where:   { id: dto.workshopId },
        include: { enterprise: true, equipment: true },
      })
      .catch(() => { throw new NotFoundError('Workshop', dto.workshopId); });

    if (workshop.enterprise.playerId !== playerId) {
      throw new ForbiddenError('Not the owner of this workshop');
    }
    if (!workshop.enterprise.isOperational) {
      throw new AppError('Enterprise is not yet operational', 422, 'NOT_OPERATIONAL');
    }

    // ── Перевірка площі підлоги цеху ─────────────────────────────────────
    const usedFloorM2 = workshop.equipment.length * EQUIPMENT_UNIT_FOOTPRINT_M2;
    if (usedFloorM2 + dto.footprintM2 > workshop.footprintM2) {
      throw new WorkshopCapacityExceededError(
        workshop.id,
        workshop.footprintM2,
        usedFloorM2,
        dto.footprintM2,
      );
    }

    const player  = await this.prisma.player.findUniqueOrThrow({ where: { id: playerId } });
    const balance = new Decimal(player.cashBalance.toString());
    const price   = new Decimal(dto.priceUah.toString());
    if (balance.lessThan(price)) {
      throw new InsufficientFundsError(price.toNumber(), balance.toNumber());
    }

    const product = await this.prisma.product
      .findUniqueOrThrow({ where: { id: dto.productId } })
      .catch(() => { throw new NotFoundError('Product (equipment catalog)', dto.productId); });

    return this.prisma.$transaction(async tx => {
      const equipment = await tx.equipment.create({
        data: {
          workshopId:          dto.workshopId,
          catalogProductId:    dto.productId,
          name:                product.name,
          status:              'NEW',
          wearAndTear:         0,
          wearRatePerTick:     0.005,
          isBroken:            false,
          energyConsumptionKw: 5.0,
          baseQualityModifier: 1.0,
          marketValueUah:      price,
          maintenanceCostUah:  price.times('0.03'),  // 3% ціни/міс
        },
      });

      await tx.player.update({
        where: { id: playerId },
        data:  { cashBalance: { decrement: price } },
      });

      await tx.financialTransaction.create({
        data: {
          playerId,
          type:          'EQUIPMENT_PURCHASE',
          amountUah:     price.negated(),
          balanceBefore: balance,
          balanceAfter:  balance.minus(price),
          description:   `Придбання обладнання '${product.name}' для цеху ${dto.workshopId}`,
          referenceId:   equipment.id,
        },
      });

      return equipment.id;
    });
  }
}
