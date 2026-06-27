/**
 * Production requirements configuration.
 *
 * Defines per-EnterpriseType constraints for:
 *   - minimum / recommended staff count (scales with workshop area)
 *   - minimum workshop floor area
 *   - minimum installed equipment units
 *   - required equipment SKUs (each must have ≥1 operational unit)
 *
 * To add a new enterprise type or adjust rules — edit this file only.
 * No changes to ProductionService or CapacityService are needed.
 */

export interface EnterpriseTypeRequirements {
  /**
   * Hard minimum: if active (non-striking) staff < this, workshop cannot produce.
   * Set to 0 to disable the hard block (penalty still applies).
   */
  minStaff: number;

  /**
   * Recommended staff per 100 m² of workshop footprint.
   * recommendedStaff = max(minStaff, ceil(footprintM2 × this / 100))
   * Actual / recommended ratio drives staffMult (0.30–1.10).
   */
  recommendedStaffPer100m2: number;

  /**
   * Minimum workshop footprint (m²) to produce anything.
   * Below 30 % of this → hard block.
   * Below 100 % → proportional area penalty (areaMult 0.50–1.0).
   */
  minWorkshopAreaM2: number;

  /**
   * Minimum number of installed, non-broken equipment units in the workshop.
   * Falling below this applies a significant penalty (0.60×) but not a hard block.
   * Set to 0 for enterprise types that don't require equipment.
   */
  minEquipmentUnits: number;

  /**
   * Equipment product SKUs where the workshop must have ≥1 operational unit
   * of EACH listed SKU (AND logic).  Missing one → proportional requiredEquipMult penalty.
   * Empty array = no specific equipment required.
   */
  requiredEquipmentSkus: readonly string[];
}

export const ENTERPRISE_REQUIREMENTS: Readonly<Record<string, EnterpriseTypeRequirements>> = {
  FOOD_PROCESSING: {
    minStaff:                3,
    recommendedStaffPer100m2: 2.0,   // 2 workers per 100 m²
    minWorkshopAreaM2:        80,
    minEquipmentUnits:        1,     // must have at least 1 piece of processing equipment
    requiredEquipmentSkus:    [],    // any processing equipment accepted
  },

  TEXTILE_FACTORY: {
    minStaff:                4,
    recommendedStaffPer100m2: 3.0,
    minWorkshopAreaM2:        100,
    minEquipmentUnits:        1,
    requiredEquipmentSkus:    [],
  },

  AGRO_FARM: {
    minStaff:                2,
    recommendedStaffPer100m2: 0.4,   // large land plots → sparse staffing is normal
    minWorkshopAreaM2:        200,
    minEquipmentUnits:        0,     // FarmMachinery handled separately in TickEngine
    requiredEquipmentSkus:    [],
  },

  RETAIL_STORE: {
    minStaff:                1,
    recommendedStaffPer100m2: 1.0,
    minWorkshopAreaM2:        30,
    minEquipmentUnits:        0,
    requiredEquipmentSkus:    [],
  },

  WAREHOUSE: {
    minStaff:                1,
    recommendedStaffPer100m2: 0.5,
    minWorkshopAreaM2:        100,
    minEquipmentUnits:        0,
    requiredEquipmentSkus:    [],
  },

  LOGISTICS_HUB: {
    minStaff:                2,
    recommendedStaffPer100m2: 1.0,
    minWorkshopAreaM2:        150,
    minEquipmentUnits:        0,
    requiredEquipmentSkus:    [],
  },

  RD_LABORATORY: {
    minStaff:                2,
    recommendedStaffPer100m2: 3.0,   // research is labour-intensive relative to space
    minWorkshopAreaM2:        50,
    minEquipmentUnits:        1,     // must have lab equipment
    requiredEquipmentSkus:    [],
  },

  OFFICE: {
    minStaff:                1,
    recommendedStaffPer100m2: 2.0,
    minWorkshopAreaM2:        20,
    minEquipmentUnits:        0,
    requiredEquipmentSkus:    [],
  },
} as const;

/** Fallback used when an enterprise type has no explicit entry. */
export const DEFAULT_REQUIREMENTS: EnterpriseTypeRequirements = {
  minStaff:                1,
  recommendedStaffPer100m2: 1.0,
  minWorkshopAreaM2:        50,
  minEquipmentUnits:        0,
  requiredEquipmentSkus:    [],
};
