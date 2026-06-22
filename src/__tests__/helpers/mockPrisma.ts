/**
 * Фабрика мок-об'єкта PrismaClient для юніт/інтеграційних тестів.
 * Кожен метод — jest.fn() із можливістю mockResolvedValueOnce / mockResolvedValue.
 *
 * $transaction підтримує два режими:
 *   – Array-режим:    $transaction([op1, op2])  → Promise.all(array)
 *   – Callback-режим: $transaction(async tx => {...}) → викликає fn(mock)
 */
export type MockPrisma = ReturnType<typeof createMockPrisma>;

export function createMockPrisma() {
  const mock = {
    player: {
      findUniqueOrThrow: jest.fn(),
      findUnique:        jest.fn(),
      findMany:          jest.fn(),
      update:            jest.fn(),
      updateMany:        jest.fn(),
      create:            jest.fn(),
    },
    enterprise: {
      findUniqueOrThrow: jest.fn(),
      findUnique:        jest.fn(),
      findFirst:         jest.fn(),
      findMany:          jest.fn(),
      create:            jest.fn(),
      update:            jest.fn(),
    },
    office: {
      findUnique:        jest.fn(),
      findFirst:         jest.fn(),
      create:            jest.fn(),
    },
    landPlot: {
      findUniqueOrThrow: jest.fn(),
      findUnique:        jest.fn(),
      findMany:          jest.fn(),
      update:            jest.fn(),
      updateMany:        jest.fn(),
    },
    workshop: {
      findUniqueOrThrow: jest.fn(),
      findUnique:        jest.fn(),
      findMany:          jest.fn(),
      update:            jest.fn(),
    },
    equipment: {
      findMany:  jest.fn(),
      create:    jest.fn(),
      update:    jest.fn(),
    },
    employee: {
      findMany:   jest.fn(),
      findUnique: jest.fn(),
      count:      jest.fn(),
      create:     jest.fn(),
      update:     jest.fn(),
      updateMany: jest.fn(),
    },
    product: {
      findFirst:         jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findUnique:        jest.fn(),
    },
    marketOrder: {
      findUnique:        jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany:          jest.fn(),
      create:            jest.fn(),
      update:            jest.fn(),
      updateMany:        jest.fn(),
    },
    enterpriseInventory: {
      findUnique:  jest.fn(),
      findMany:    jest.fn(),
      update:      jest.fn(),
      updateMany:  jest.fn(),
      create:      jest.fn(),
      upsert:      jest.fn(),
    },
    playerInventory: {
      findUnique:  jest.fn(),
      findMany:    jest.fn(),
      update:      jest.fn(),
      create:      jest.fn(),
      upsert:      jest.fn(),
    },
    financialTransaction: {
      create:     jest.fn(),
      createMany: jest.fn(),
    },
    constructionProject: {
      create: jest.fn(),
      update: jest.fn(),
    },
    npcDemand: {
      findMany: jest.fn(),
    },
    city: {
      findUniqueOrThrow: jest.fn(),
      findMany:          jest.fn(),
    },
    $transaction: jest.fn(),
  };

  // За замовчуванням: callback-режим прозоро делегує моку, array-режим → Promise.all
  mock.$transaction.mockImplementation((arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (tx: typeof mock) => Promise<unknown>)(mock);
    }
    if (Array.isArray(arg)) {
      return Promise.all(arg);
    }
    return Promise.resolve();
  });

  return mock;
}

/** Скидає всі mock-виклики між тестами. */
export function resetMockPrisma(mock: MockPrisma): void {
  for (const model of Object.values(mock)) {
    if (model && typeof model === 'object') {
      for (const fn of Object.values(model as Record<string, unknown>)) {
        if (typeof fn === 'function' && 'mockReset' in fn) {
          (fn as jest.Mock).mockReset();
        }
      }
    }
  }
  // Відновлюємо дефолтну реалізацію $transaction після reset
  mock.$transaction.mockImplementation((arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (tx: typeof mock) => Promise<unknown>)(mock);
    }
    if (Array.isArray(arg)) {
      return Promise.all(arg);
    }
    return Promise.resolve();
  });
}
