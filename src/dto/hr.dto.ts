import type { Profession } from '@prisma/client';
import { ValidationError } from '../errors/AppError';
import {
  requireBody,
  requireUUID,
  requireUUIDArray,
  requirePositiveNumber,
  requireEnum,
  requireString,
} from './validators';

const PROFESSIONS = [
  'ACCOUNTANT', 'MANAGER', 'OPERATOR', 'ENGINEER', 'AGRONOMIST',
  'LOADER', 'DRIVER', 'SECURITY_GUARD', 'CLEANER', 'SALES_REP',
  'IT_SPECIALIST', 'LAWYER', 'HR_SPECIALIST', 'TECHNICIAN', 'QUALITY_CONTROLLER',
] as const satisfies readonly Profession[];

/** Мінімальна зарплата 2026 (законодавчий мінімум, UAH брутто). */
export const MIN_LEGAL_SALARY_UAH = 8_000;

/** Порогове значення: менше — зарплата вважається "критично низькою" і блокується. */
export const ABSOLUTE_MIN_SALARY_UAH = 5_000;

// ─── DTOs ──────────────────────────────────────────────────────────────────

export interface HireEmployeeDto {
  enterpriseId: string;    // UUID підприємства
  profession:   Profession;
  firstName:    string;
  lastName:     string;
  salaryUah:    number;    // брутто, UAH; > MIN_LEGAL_SALARY_UAH
}

export interface AdjustSalaryDto {
  employeeIds: string[];   // масив UUID (мін 1)
  salaryUah:   number;     // нова брутто зарплата (UAH)
}

// ─── Parsers ───────────────────────────────────────────────────────────────

export function parseHireEmployeeDto(body: unknown): HireEmployeeDto {
  const b          = requireBody(body, 'POST /hr/hire');
  const salaryUah  = requirePositiveNumber(b.salaryUah, 'salaryUah');

  if (salaryUah < MIN_LEGAL_SALARY_UAH) {
    throw new ValidationError(
      `Salary ₴${salaryUah.toFixed(0)} is below the 2026 legal minimum ` +
      `(₴${MIN_LEGAL_SALARY_UAH.toLocaleString('uk')}). ` +
      `Set a higher salary to comply with Ukrainian labour law.`,
      { minimum: MIN_LEGAL_SALARY_UAH, provided: salaryUah },
    );
  }

  return {
    enterpriseId: requireUUID(b.enterpriseId, 'enterpriseId'),
    profession:   requireEnum<Profession>(b.profession, 'profession', PROFESSIONS),
    firstName:    requireString(b.firstName, 'firstName', 60),
    lastName:     requireString(b.lastName, 'lastName', 80),
    salaryUah,
  };
}

export function parseAdjustSalaryDto(body: unknown): AdjustSalaryDto {
  const b         = requireBody(body, 'PUT /hr/salary');
  const salaryUah = requirePositiveNumber(b.salaryUah, 'salaryUah');

  // Повне блокування нижче абсолютного мінімуму; від 5k до 8k — дозволяємо з попередженням
  if (salaryUah < ABSOLUTE_MIN_SALARY_UAH) {
    throw new ValidationError(
      `Salary ₴${salaryUah.toFixed(0)} is below the absolute floor ` +
      `(₴${ABSOLUTE_MIN_SALARY_UAH.toLocaleString('uk')}). ` +
      `Refusing to update to prevent severe mood penalties.`,
      { absoluteFloor: ABSOLUTE_MIN_SALARY_UAH, provided: salaryUah },
    );
  }

  return {
    employeeIds: requireUUIDArray(b.employeeIds, 'employeeIds'),
    salaryUah,
  };
}
