import type { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { BASELINE_SALARY_UAH } from '../constants/economic';
import { parseHireEmployeeDto, parseAdjustSalaryDto, MIN_LEGAL_SALARY_UAH } from '../dto/hr.dto';
import { ForbiddenError, NotFoundError, AppError } from '../errors/AppError';

/** Максимальна кількість співробітників на 100 м² корисної площі підприємства. */
const MAX_EMPLOYEES_PER_100M2 = 2;

/**
 * Контролер HR-операцій — наймання та управління зарплатами.
 * Бізнес-логіка тут невелика, тому вбудована в контролер без окремого HRManagementService.
 */
export class HRManagementController {
  constructor(private readonly prisma: PrismaClient) {
    this.hireEmployee  = this.hireEmployee.bind(this);
    this.adjustSalary  = this.adjustSalary.bind(this);
  }

  /**
   * POST /hr/hire
   *
   * Наймає нового співробітника у вказане підприємство.
   *
   * Перевірки:
   *  – Підприємство належить гравцю та є операційним
   *  – Поточна кількість співробітників < ліміт (MAX_EMPLOYEES_PER_100M2 × totalFloorAreaM2 / 100)
   *  – Зарплата ≥ MIN_LEGAL_SALARY_UAH (2026)
   *
   * Response 201: { employeeId, projectedMonthlyCostUah }
   */
  async hireEmployee(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const playerId = req.user!.id;
      const dto      = parseHireEmployeeDto(req.body);

      const enterprise = await this.prisma.enterprise
        .findUniqueOrThrow({
          where:   { id: dto.enterpriseId },
          include: { employees: { select: { id: true } } },
        })
        .catch(() => { throw new NotFoundError('Enterprise', dto.enterpriseId); });

      if (enterprise.playerId !== playerId) {
        throw new ForbiddenError('Enterprise does not belong to this player');
      }
      if (!enterprise.isOperational) {
        throw new AppError('Enterprise is still under construction', 422, 'NOT_OPERATIONAL');
      }

      // Ліміт персоналу: 2 особи на кожні 100 м² корисної площі
      const capacity    = Math.max(1, Math.floor(enterprise.totalFloorAreaM2 / 100 * MAX_EMPLOYEES_PER_100M2));
      const currentHead = enterprise.employees.length;
      if (currentHead >= capacity) {
        throw new AppError(
          `Enterprise is at full staffing capacity (${currentHead}/${capacity}). ` +
          `Expand the building (totalFloorAreaM2) to hire more staff.`,
          422,
          'ENTERPRISE_AT_CAPACITY',
          { current: currentHead, capacity },
        );
      }

      const salaryDecimal = new Decimal(dto.salaryUah.toString());

      const employee = await this.prisma.employee.create({
        data: {
          playerId,
          enterpriseId:    dto.enterpriseId,
          firstName:       dto.firstName,
          lastName:        dto.lastName,
          profession:      dto.profession,
          salaryUah:       salaryDecimal,
          mood:            0.70,
          baseEfficiency:  1.00,
          efficiency:      1.00,
          isOnStrike:      false,
          accruedSalaryUah: new Decimal(0),
        },
      });

      // Повна вартість для роботодавця: брутто + ЄСВ 22%
      const monthlyCostUah = salaryDecimal.times('1.22');
      // Рекомендована ставка для цієї посади (Kyiv baseline)
      const baselineSalary = BASELINE_SALARY_UAH[dto.profession] ?? MIN_LEGAL_SALARY_UAH;

      res.status(201).json({
        success: true,
        data: {
          employeeId:             employee.id,
          fullName:               `${dto.firstName} ${dto.lastName}`,
          profession:             dto.profession,
          grossSalaryUah:         dto.salaryUah,
          projectedMonthlyCostUah: monthlyCostUah.toNumber(), // брутто + ЄСВ
          baselineSalaryForRole:  baselineSalary,
          belowBaseline:          dto.salaryUah < baselineSalary,
          moodNote: dto.salaryUah < baselineSalary
            ? `Salary is ${((1 - dto.salaryUah / baselineSalary) * 100).toFixed(0)}% below ` +
              `Kyiv market baseline for ${dto.profession}. Mood will drift downward each tick.`
            : 'Salary is at or above market baseline.',
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PUT /hr/salary
   *
   * Оновлює брутто-зарплату для групи співробітників.
   * Зміна набуває чинності в наступному тіку game loop (processTick → mood update).
   *
   * Body: AdjustSalaryDto { employeeIds: string[], salaryUah: number }
   * Response 200: { updated, skipped, projectedMoodImpact }
   */
  async adjustSalary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const playerId = req.user!.id;
      const dto      = parseAdjustSalaryDto(req.body);

      // Перевіряємо, що всі вказані співробітники належать цьому гравцеві
      const employees = await this.prisma.employee.findMany({
        where: { id: { in: dto.employeeIds } },
        include: {
          enterprise: {
            include: {
              landPlot: { include: { city: { select: { wageBaselineUah: true, nameUa: true } } } },
            },
          },
        },
      });

      // Перевіряємо право власності на кожного
      const alienIds = employees
        .filter(e => e.playerId !== playerId)
        .map(e => e.id);
      if (alienIds.length > 0) {
        throw new ForbiddenError(
          `Employees [${alienIds.join(', ')}] do not belong to this player`,
        );
      }

      const notFoundIds = dto.employeeIds.filter(
        id => !employees.find(e => e.id === id),
      );
      if (notFoundIds.length > 0) {
        throw new NotFoundError('Employee(s)', notFoundIds.join(', '));
      }

      const newSalary = new Decimal(dto.salaryUah.toString());

      await this.prisma.employee.updateMany({
        where: { id: { in: dto.employeeIds }, playerId },
        data:  { salaryUah: newSalary },
      });

      // Проекція настрою для кожного співробітника
      const moodProjections = employees.map(emp => {
        const cityBaseline = new Decimal(emp.enterprise.landPlot.city.wageBaselineUah.toString());
        const previousSalary = new Decimal(emp.salaryUah.toString());
        const underpayRatio  = newSalary.lessThan(cityBaseline)
          ? 1 - newSalary.dividedBy(cityBaseline).toNumber()
          : 0;
        // UNDERPAY_PENALTY_MAX = 0.06 (per tick)
        const estimatedMoodDeltaPerTick = -(0.06 * underpayRatio);

        return {
          employeeId:              emp.id,
          fullName:                `${emp.firstName} ${emp.lastName}`,
          city:                    emp.enterprise.landPlot.city.nameUa,
          previousSalaryUah:       previousSalary.toNumber(),
          newSalaryUah:            dto.salaryUah,
          cityWageBaselineUah:     cityBaseline.toNumber(),
          currentMood:             emp.mood,
          estimatedMoodDeltaPerTick: parseFloat(estimatedMoodDeltaPerTick.toFixed(4)),
          ticksToStrikeThreshold:  underpayRatio > 0
            ? Math.ceil((emp.mood - 0.25) / Math.abs(estimatedMoodDeltaPerTick))
            : null,
          warning: underpayRatio > 0.3
            ? `Salary is ${(underpayRatio * 100).toFixed(0)}% below ${emp.enterprise.landPlot.city.nameUa} ` +
              `baseline. Strike risk in ~${Math.ceil((emp.mood - 0.25) / Math.abs(estimatedMoodDeltaPerTick))} ticks.`
            : null,
        };
      });

      res.status(200).json({
        success: true,
        data: {
          updatedCount:      dto.employeeIds.length,
          newSalaryUah:      dto.salaryUah,
          monthlyCostPerEmployee: newSalary.times('1.22').toNumber(),
          moodProjections,
        },
      });
    } catch (err) {
      next(err);
    }
  }
}
