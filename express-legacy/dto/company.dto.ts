import type { EnterpriseType } from '@prisma/client';
import { ValidationError } from '../errors/AppError';
import {
  requireBody,
  requireUUID,
  requirePositiveNumber,
  requireEnum,
  requireString,
  requireOptionalPositiveNumber,
} from './validators';

export type AcquisitionMethod    = 'BUY' | 'RENT';
export type LandAcquisitionMethod = 'BUY' | 'LEASE';

const ENTERPRISE_TYPES = [
  'OFFICE', 'AGRO_FARM', 'TEXTILE_FACTORY',
  'FOOD_PROCESSING', 'RETAIL_STORE', 'WAREHOUSE', 'LOGISTICS_HUB',
] as const satisfies readonly EnterpriseType[];

// ─── DTOs ──────────────────────────────────────────────────────────────────

export interface RegisterOfficeDto {
  landPlotId:      string;            // UUID власної або орендованої ділянки
  sizeM2:          number;            // > 0 м²
  method:          AcquisitionMethod; // BUY (власне) | RENT (орендне приміщення)
  monthlyRentUah?: number;            // обов'язково при method=RENT
}

export interface AcquireLandDto {
  landPlotId: string;                  // UUID вільної ділянки
  method:     LandAcquisitionMethod;   // BUY | LEASE
}

export interface BuildEnterpriseDto {
  landPlotId:        string;          // UUID власної/орендованої ділянки
  type:              EnterpriseType;
  name:              string;          // назва підприємства (≤100 символів)
  footprintM2:       number;          // > 0 — площа забудови на ділянці
  totalFloorAreaM2:  number;          // ≥ footprintM2 — корисна площа будівлі
}

export interface InstallEquipmentDto {
  workshopId:  string;  // UUID цеху
  productId:   string;  // UUID catalog-продукту (isEquipmentItem = true)
  footprintM2: number;  // > 0 — площа підлоги під обладнання
  priceUah:    number;  // > 0 — ціна придбання
}

// ─── Parsers (validate + transform) ────────────────────────────────────────

export function parseRegisterOfficeDto(body: unknown): RegisterOfficeDto {
  const b      = requireBody(body, 'POST /company/office/register');
  const method = requireEnum<AcquisitionMethod>(b.method, 'method', ['BUY', 'RENT']);

  return {
    landPlotId:     requireUUID(b.landPlotId, 'landPlotId'),
    sizeM2:         requirePositiveNumber(b.sizeM2, 'sizeM2'),
    method,
    monthlyRentUah: method === 'RENT'
      ? requirePositiveNumber(b.monthlyRentUah, 'monthlyRentUah')
      : requireOptionalPositiveNumber(b.monthlyRentUah, 'monthlyRentUah'),
  };
}

export function parseAcquireLandDto(body: unknown): AcquireLandDto {
  const b = requireBody(body, 'POST /company/land/acquire');
  return {
    landPlotId: requireUUID(b.landPlotId, 'landPlotId'),
    method:     requireEnum<LandAcquisitionMethod>(b.method, 'method', ['BUY', 'LEASE']),
  };
}

export function parseBuildEnterpriseDto(body: unknown): BuildEnterpriseDto {
  const b   = requireBody(body, 'POST /company/enterprise/build');
  const dto: BuildEnterpriseDto = {
    landPlotId:       requireUUID(b.landPlotId, 'landPlotId'),
    type:             requireEnum<EnterpriseType>(b.type, 'type', ENTERPRISE_TYPES),
    name:             requireString(b.name, 'name', 100),
    footprintM2:      requirePositiveNumber(b.footprintM2, 'footprintM2'),
    totalFloorAreaM2: requirePositiveNumber(b.totalFloorAreaM2, 'totalFloorAreaM2'),
  };
  if (dto.totalFloorAreaM2 < dto.footprintM2) {
    throw new ValidationError('"totalFloorAreaM2" must be >= "footprintM2"', {
      footprintM2: dto.footprintM2,
      totalFloorAreaM2: dto.totalFloorAreaM2,
    });
  }
  return dto;
}

export function parseInstallEquipmentDto(body: unknown): InstallEquipmentDto {
  const b = requireBody(body, 'POST /company/workshop/equipment');
  return {
    workshopId:  requireUUID(b.workshopId, 'workshopId'),
    productId:   requireUUID(b.productId, 'productId'),
    footprintM2: requirePositiveNumber(b.footprintM2, 'footprintM2'),
    priceUah:    requirePositiveNumber(b.priceUah, 'priceUah'),
  };
}
