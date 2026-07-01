import { describe, it, expect } from 'vitest';
import { CapacityService } from './CapacityService';

describe('CapacityService.compute', () => {
  it('hard-blocks production when active staff is below the minimum', () => {
    const result = CapacityService.compute({
      enterpriseType:           'RETAIL_STORE',
      activeStaffCount:         0,
      workshopAreaM2:           100,
      installedEquipmentCount:  1,
      operationalEquipmentSkus: [],
    });
    expect(result.canProduce).toBe(false);
    expect(result.multiplier).toBe(0);
  });

  it('hard-blocks production when workshop area is far below the minimum', () => {
    const result = CapacityService.compute({
      enterpriseType:           'AGRO_FARM', // minWorkshopAreaM2 = 200
      activeStaffCount:         5,
      workshopAreaM2:           10, // well under 30% of 200
      installedEquipmentCount:  0,
      operationalEquipmentSkus: [],
    });
    expect(result.canProduce).toBe(false);
    expect(result.multiplier).toBe(0);
  });

  it('allows production once minimum staff and area are met', () => {
    const result = CapacityService.compute({
      enterpriseType:           'AGRO_FARM',
      activeStaffCount:         2,
      workshopAreaM2:           200,
      installedEquipmentCount:  0,
      operationalEquipmentSkus: [],
    });
    expect(result.canProduce).toBe(true);
    expect(result.multiplier).toBeGreaterThan(0);
  });

  it('falls back to DEFAULT_REQUIREMENTS for an unknown enterprise type', () => {
    const result = CapacityService.compute({
      enterpriseType:           'SOME_UNKNOWN_TYPE',
      activeStaffCount:         0,
      workshopAreaM2:           50,
      installedEquipmentCount:  0,
      operationalEquipmentSkus: [],
    });
    // DEFAULT_REQUIREMENTS.minStaff = 1 → 0 active staff still hard-blocks
    expect(result.canProduce).toBe(false);
  });
});
