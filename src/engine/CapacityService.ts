/**
 * CapacityService — pure, stateless computation of workshop production multiplier.
 *
 * Determines how well a workshop is staffed, sized, and equipped relative to
 * the requirements defined in `productionRequirements.ts`.
 *
 * Formula (all components ∈ [0, 1] except staffMult which can reach 1.10):
 *
 *   staffMult      = clamp(activeStaff / recommendedStaff, 0.30, 1.10)
 *   areaMult       = clamp(workshopM2 / minAreaM2, 0.50, 1.00)
 *   equipCountMult = 0.60 if installedEquip < minEquipmentUnits, else 1.0
 *   requiredEquipMult = metCount / totalRequired   (1.0 if no requirements)
 *
 *   multiplier = staffMult × areaMult × equipCountMult × requiredEquipMult
 *
 * Hard blocks (canProduce = false):
 *   - activeStaff < cfg.minStaff
 *   - workshopM2  < cfg.minWorkshopAreaM2 × 0.30  (below 30 % of minimum)
 */

import {
  ENTERPRISE_REQUIREMENTS,
  DEFAULT_REQUIREMENTS,
  type EnterpriseTypeRequirements,
} from '../config/productionRequirements';
import { clamp } from '../types';

export interface CapacityBreakdown {
  staffMult:        number;
  areaMult:         number;
  equipCountMult:   number;
  requiredEquipMult: number;
  recommendedStaff: number;
  activeStaff:      number;
}

export interface CapacityResult {
  canProduce:  boolean;
  multiplier:  number;
  breakdown:   CapacityBreakdown;
  /** Human-readable reason when canProduce = false */
  reason?: string;
}

export interface CapacityInput {
  enterpriseType:           string;
  /** Number of employees who are not on strike */
  activeStaffCount:         number;
  /** Workshop.footprintM2 */
  workshopAreaM2:           number;
  /** Count of installed non-broken equipment units in this workshop */
  installedEquipmentCount:  number;
  /** SKUs of operational (non-broken) equipment units in this workshop */
  operationalEquipmentSkus: string[];
}

export class CapacityService {
  static compute(input: CapacityInput): CapacityResult {
    const cfg: EnterpriseTypeRequirements =
      ENTERPRISE_REQUIREMENTS[input.enterpriseType] ?? DEFAULT_REQUIREMENTS;

    // ── Hard block: insufficient staff ───────────────────────────────────────
    if (input.activeStaffCount < cfg.minStaff) {
      return {
        canProduce: false,
        multiplier: 0,
        reason:     `Потрібно мінімум ${cfg.minStaff} працівників (є ${input.activeStaffCount})`,
        breakdown:  CapacityService.zeroBreakdown(input.activeStaffCount, cfg.minStaff),
      };
    }

    // ── Hard block: critically insufficient area ──────────────────────────────
    const hardAreaFloor = cfg.minWorkshopAreaM2 * 0.30;
    if (input.workshopAreaM2 < hardAreaFloor) {
      return {
        canProduce: false,
        multiplier: 0,
        reason:     `Площа цеху ${input.workshopAreaM2} м² нижче критичного мінімуму (${hardAreaFloor.toFixed(0)} м²)`,
        breakdown:  CapacityService.zeroBreakdown(input.activeStaffCount, cfg.minStaff),
      };
    }

    // ── Staff multiplier ──────────────────────────────────────────────────────
    // recommendedStaff scales with workshop size
    const recommendedStaff = Math.max(
      cfg.minStaff,
      Math.ceil(input.workshopAreaM2 * cfg.recommendedStaffPer100m2 / 100),
    );
    const staffRatio = input.activeStaffCount / recommendedStaff;
    // 0.30 floor (severe understaff), 1.10 ceiling (10 % bonus for overstaffing)
    const staffMult  = clamp(staffRatio, 0.30, 1.10);

    // ── Area multiplier ───────────────────────────────────────────────────────
    // Soft range: [0.50, 1.00]
    const areaMult = cfg.minWorkshopAreaM2 > 0
      ? clamp(input.workshopAreaM2 / cfg.minWorkshopAreaM2, 0.50, 1.00)
      : 1.0;

    // ── Equipment count multiplier ────────────────────────────────────────────
    const equipCountMult = (
      cfg.minEquipmentUnits > 0 &&
      input.installedEquipmentCount < cfg.minEquipmentUnits
    ) ? 0.60 : 1.0;

    // ── Required equipment SKU multiplier ─────────────────────────────────────
    let requiredEquipMult = 1.0;
    if (cfg.requiredEquipmentSkus.length > 0) {
      const metCount = cfg.requiredEquipmentSkus.filter(
        sku => input.operationalEquipmentSkus.includes(sku),
      ).length;
      // Linear: missing 1 of 2 required → 0.5×; missing all → 0.0×
      requiredEquipMult = clamp(
        metCount / cfg.requiredEquipmentSkus.length,
        0.0,
        1.0,
      );
    }

    const multiplier = staffMult * areaMult * equipCountMult * requiredEquipMult;

    return {
      canProduce: true,
      multiplier,
      breakdown: {
        staffMult,
        areaMult,
        equipCountMult,
        requiredEquipMult,
        recommendedStaff,
        activeStaff: input.activeStaffCount,
      },
    };
  }

  private static zeroBreakdown(activeStaff: number, recommendedStaff: number): CapacityBreakdown {
    return {
      staffMult: 0, areaMult: 0, equipCountMult: 0, requiredEquipMult: 0,
      recommendedStaff, activeStaff,
    };
  }
}
