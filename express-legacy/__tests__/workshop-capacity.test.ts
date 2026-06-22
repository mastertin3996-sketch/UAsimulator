/**
 * TEST SUITE 1 — Workshop Floor Capacity Validation
 *
 * Сценарій: гравець намагається встановити обладнання загальним footprintM2 = 500 м²
 * у цех площею 300 м². Сервіс повинен відхилити запит ще до будь-яких операцій з БД.
 *
 * Кожна одиниця обладнання займає EQUIPMENT_UNIT_FOOTPRINT_M2 = 30 м².
 * Workshop.footprintM2 = 300 м² → ліміт 10 одиниць.
 * Запит на 500 м² (≈16–17 одиниць) → WorkshopCapacityExceededError.
 */

import { PrismaClient }                   from '@prisma/client';
import { Decimal }                         from '@prisma/client/runtime/library';
import { CompanyService }                  from '../services/CompanyService';
import {
  WorkshopCapacityExceededError,
  InsufficientFundsError,
  ForbiddenError,
} from '../errors/AppError';
import { createMockPrisma, resetMockPrisma } from './helpers/mockPrisma';

// ── Фікстури ────────────────────────────────────────────────────────────────

const PLAYER_ID   = 'player-00000000-0000-0000-0000-000000000001';
const WORKSHOP_ID = 'workshop-0000-0000-0000-0000-000000000001';
const PRODUCT_ID  = 'product-00000000-0000-0000-0000-000000000001';

/** Цех площею 300 м² без жодного встановленого обладнання. */
const mockEmptyWorkshop = (overrides: Partial<{
  footprintM2: number;
  equipmentCount: number;
  playerId: string;
  isOperational: boolean;
}> = {}) => ({
  id:          WORKSHOP_ID,
  enterpriseId: 'ent-1',
  name:        'Головний цех',
  footprintM2: overrides.footprintM2 ?? 300,
  maxCapacity: 100,
  currentVolume: 0,
  isActive:    true,
  basePowerKwhPerTick: 2,
  enterprise: {
    id:              'ent-1',
    playerId:        overrides.playerId ?? PLAYER_ID,
    isOperational:   overrides.isOperational ?? true,
    name:            'Тестова фабрика',
    type:            'FOOD_PROCESSING',
    landPlotId:      'land-1',
    footprintM2:     500,
    totalFloorAreaM2: 500,
    usedFloorAreaM2: 0,
    basePowerKwhPerTick: 5,
    constructedAt:   null,
  },
  // Генеруємо фейкові одиниці обладнання (кожна = 30 м²)
  equipment: Array.from({ length: overrides.equipmentCount ?? 0 }, (_, i) => ({
    id:                `eq-${i}`,
    workshopId:        WORKSHOP_ID,
    catalogProductId:  PRODUCT_ID,
    name:              `Машина ${i + 1}`,
    status:            'OPERATIONAL' as const,
    wearAndTear:       0.1,
    wearRatePerTick:   0.005,
    isBroken:          false,
    energyConsumptionKw: 5,
    baseQualityModifier: 1.0,
    marketValueUah:    new Decimal('50000'),
    maintenanceCostUah: new Decimal('1500'),
    purchasedAt:       new Date(),
    lastMaintenanceAt: new Date(),
  })),
});

const mockProduct = {
  id:              PRODUCT_ID,
  sku:             'EQ-CONVEYOR',
  name:            'Конвеєрна лінія',
  nameUa:          'Конвеєрна лінія',
  category:        'EQUIPMENT_ITEM' as const,
  unit:            'шт',
  baseWeightKg:    5000,
  baseVolumeLitre: 0,
  isEquipmentItem: true,
};

const mockPlayer = (balance: number) => ({
  id:             PLAYER_ID,
  email:          'test@example.com',
  username:       'testplayer',
  passwordHash:   'x',
  companyName:    'Test Co',
  cashBalance:    new Decimal(balance.toString()),
  netWorth:       new Decimal(balance.toString()),
  creditRating:   7.0,
  reputationScore: 5.0,
  createdAt:      new Date(),
  lastActiveAt:   new Date(),
});

// ── Тести ───────────────────────────────────────────────────────────────────

describe('CompanyService.installEquipment — Workshop Floor Capacity', () => {
  let mock: ReturnType<typeof createMockPrisma>;
  let svc:  CompanyService;

  beforeEach(() => {
    mock = createMockPrisma();
    svc  = new CompanyService(mock as unknown as PrismaClient);
  });

  afterEach(() => {
    resetMockPrisma(mock);
  });

  // ── Тест 1: 500 м² обладнання у 300 м² цеху → відхилення ───────────────

  it('rejects equipment with footprint 500 m² in a 300 m² workshop', async () => {
    mock.workshop.findUniqueOrThrow.mockResolvedValueOnce(mockEmptyWorkshop());
    // Гравець має достатньо коштів — відмова має бути через площу, не фінанси
    mock.player.findUniqueOrThrow.mockResolvedValueOnce(mockPlayer(5_000_000));

    await expect(
      svc.installEquipment(PLAYER_ID, {
        workshopId:  WORKSHOP_ID,
        productId:   PRODUCT_ID,
        footprintM2: 500,   // ← більше, ніж workshop.footprintM2 = 300
        priceUah:    200_000,
      }),
    ).rejects.toThrow(WorkshopCapacityExceededError);

    // Жодних записів у БД не має відбутися
    expect(mock.equipment.create).not.toHaveBeenCalled();
    expect(mock.player.update).not.toHaveBeenCalled();
    expect(mock.financialTransaction.create).not.toHaveBeenCalled();
  });

  it('includes correct capacity numbers in the error', async () => {
    mock.workshop.findUniqueOrThrow.mockResolvedValueOnce(mockEmptyWorkshop());

    let caughtError: WorkshopCapacityExceededError | null = null;
    try {
      await svc.installEquipment(PLAYER_ID, {
        workshopId:  WORKSHOP_ID,
        productId:   PRODUCT_ID,
        footprintM2: 500,
        priceUah:    100_000,
      });
    } catch (err) {
      caughtError = err as WorkshopCapacityExceededError;
    }

    expect(caughtError).toBeInstanceOf(WorkshopCapacityExceededError);
    expect(caughtError!.code).toBe('WORKSHOP_CAPACITY_EXCEEDED');
    expect(caughtError!.statusCode).toBe(422);
    expect(caughtError!.meta).toMatchObject({
      workshopId: WORKSHOP_ID,
      totalM2:    300,
      usedM2:     0,    // 0 одиниць × 30 м²/шт = 0 м²
      newM2:      500,
    });
    expect(caughtError!.message).toContain('300');
    expect(caughtError!.message).toContain('500');
  });

  // ── Тест 2: часткове заповнення цеху + перевищення ──────────────────────

  it('blocks installation when existing equipment already consumes partial floor space', async () => {
    // 6 одиниць × 30 м² = 180 м² вже зайнято. Новий запит 150 м² → 180 + 150 = 330 > 300
    mock.workshop.findUniqueOrThrow.mockResolvedValueOnce(
      mockEmptyWorkshop({ equipmentCount: 6 }),
    );

    await expect(
      svc.installEquipment(PLAYER_ID, {
        workshopId:  WORKSHOP_ID,
        productId:   PRODUCT_ID,
        footprintM2: 150,   // 180 + 150 = 330 > 300 → overflow
        priceUah:    80_000,
      }),
    ).rejects.toThrow(WorkshopCapacityExceededError);
  });

  // ── Тест 3: точно вписується — успішне встановлення ─────────────────────

  it('allows installation when equipment exactly fits available floor space', async () => {
    // 4 одиниці × 30 = 120 м² зайнято. Нові 180 м² → 120 + 180 = 300 = ліміт ✓
    mock.workshop.findUniqueOrThrow.mockResolvedValueOnce(
      mockEmptyWorkshop({ equipmentCount: 4 }),
    );
    mock.player.findUniqueOrThrow.mockResolvedValueOnce(mockPlayer(1_000_000));
    mock.product.findUniqueOrThrow.mockResolvedValueOnce(mockProduct);
    mock.equipment.create.mockResolvedValueOnce({ ...mockProduct, id: 'eq-new-1' });
    mock.player.update.mockResolvedValueOnce({});
    mock.financialTransaction.create.mockResolvedValueOnce({});

    const equipmentId = await svc.installEquipment(PLAYER_ID, {
      workshopId:  WORKSHOP_ID,
      productId:   PRODUCT_ID,
      footprintM2: 180,   // 120 + 180 = 300 — точно вписується
      priceUah:    150_000,
    });

    expect(equipmentId).toBeDefined();
    expect(mock.equipment.create).toHaveBeenCalledTimes(1);
  });

  // ── Тест 4: відхилення при нестачі коштів ───────────────────────────────

  it('blocks installation due to insufficient funds even if floor space fits', async () => {
    mock.workshop.findUniqueOrThrow.mockResolvedValueOnce(mockEmptyWorkshop());
    // Баланс: ₴50 000, ціна обладнання: ₴200 000
    mock.player.findUniqueOrThrow.mockResolvedValueOnce(mockPlayer(50_000));

    await expect(
      svc.installEquipment(PLAYER_ID, {
        workshopId:  WORKSHOP_ID,
        productId:   PRODUCT_ID,
        footprintM2: 30,   // 1 одиниця, 30 м² — вміщується
        priceUah:    200_000,
      }),
    ).rejects.toThrow(InsufficientFundsError);

    expect(mock.equipment.create).not.toHaveBeenCalled();
  });

  // ── Тест 5: перевірка права власності ────────────────────────────────────

  it('blocks installation for a workshop owned by a different player', async () => {
    mock.workshop.findUniqueOrThrow.mockResolvedValueOnce(
      mockEmptyWorkshop({ playerId: 'other-player-id' }),
    );

    await expect(
      svc.installEquipment(PLAYER_ID, {
        workshopId:  WORKSHOP_ID,
        productId:   PRODUCT_ID,
        footprintM2: 30,
        priceUah:    50_000,
      }),
    ).rejects.toThrow(ForbiddenError);
  });
});
