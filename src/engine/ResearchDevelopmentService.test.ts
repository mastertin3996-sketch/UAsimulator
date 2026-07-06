import { describe, it, expect, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { mockDeep, mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import { ResearchDevelopmentService } from './ResearchDevelopmentService';

const prismaMock = mockDeep<PrismaClient>() as unknown as DeepMockProxy<PrismaClient>;
beforeEach(() => { mockReset(prismaMock); });

const eq = (sku: string, isBroken = false, wearAndTear = 0) => ({ isBroken, wearAndTear, catalogProduct: { sku } });

describe('ResearchDevelopmentService.labEquipmentMultiplier (Wave 6)', () => {
  const f = ResearchDevelopmentService.labEquipmentMultiplier;

  it('returns 1.0 for a lab with no equipment (no regression)', () => {
    expect(f([{ equipment: [] }])).toBe(1.0);
  });

  it('adds the per-SKU bonus for operational lab equipment', () => {
    expect(f([{ equipment: [eq('EQ-SERVERCLUSTER')] }])).toBeCloseTo(1.15, 5);
    expect(f([{ equipment: [eq('EQ-SERVERCLUSTER'), eq('EQ-SPECTROMETER')] }])).toBeCloseTo(1.27, 5);
  });

  it('ignores broken / worn-out units', () => {
    expect(f([{ equipment: [eq('EQ-SERVERCLUSTER', true, 0), eq('EQ-SPECTROMETER', false, 1.0)] }])).toBe(1.0);
  });

  it('caps the multiplier at 1.5', () => {
    const many = Array.from({ length: 10 }, () => eq('EQ-SERVERCLUSTER'));
    expect(f([{ equipment: many }])).toBe(1.5);
  });
});

describe('ResearchDevelopmentService.calculateResearchGenerationTick (Wave 6 integration)', () => {
  function stubLab(equipment: ReturnType<typeof eq>[]) {
    prismaMock.technology.findUnique.mockResolvedValue(null as never); // LEAN not unlocked → officeTechMod 0
    prismaMock.enterprise.findMany.mockResolvedValue([{
      employees: [{ profession: 'RESEARCHER', mood: 1.0 }], // base RP 5
      workshops: [{ equipment }],
    }] as never);
  }

  it('lab RP is unchanged without equipment and boosted with a server cluster', async () => {
    const svc = new ResearchDevelopmentService(prismaMock);

    stubLab([]);
    const bare = await svc.calculateResearchGenerationTick('p1');
    expect(bare).toBeCloseTo(5.0, 5); // 5 × mood 1 × (1+0)

    svc.clearCache();
    stubLab([eq('EQ-SERVERCLUSTER')]);
    const boosted = await svc.calculateResearchGenerationTick('p1');
    expect(boosted).toBeCloseTo(5.75, 5); // 5 × 1.15
  });
});
