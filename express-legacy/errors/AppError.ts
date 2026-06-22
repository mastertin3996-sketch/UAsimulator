export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
    public readonly meta?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, meta?: Record<string, unknown>) {
    super(message, 400, 'VALIDATION_ERROR', meta);
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string, id: string) {
    super(`${entity} '${id}' not found`, 404, 'NOT_FOUND', { entity, id });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, 'FORBIDDEN');
  }
}

/**
 * Гравець намагається здійснити операцію без достатнього залишку на рахунку.
 * required/available у UAH.
 */
export class InsufficientFundsError extends AppError {
  constructor(required: number, available: number) {
    super(
      `Insufficient funds: required ₴${required.toFixed(2)}, available ₴${available.toFixed(2)}`,
      402,
      'INSUFFICIENT_FUNDS',
      { required, available },
    );
  }
}

/**
 * Спроба побудувати підприємство у місті без активного офісу.
 * Офіс є обов'язковою передумовою для будь-яких операцій у місті.
 */
export class OfficeRequiredError extends AppError {
  constructor(cityId: string) {
    super(
      `An operational office in city '${cityId}' is required before building an enterprise. ` +
      `Register one via POST /company/office/register.`,
      422,
      'OFFICE_REQUIRED',
      { cityId },
    );
  }
}

/**
 * Сума площ підприємств на ділянці перевищує загальну площу ділянки.
 */
export class LandLimitExceededError extends AppError {
  constructor(landPlotId: string, availableM2: number, requestedM2: number) {
    super(
      `Land plot '${landPlotId}': only ${availableM2.toFixed(0)} m² unallocated, ` +
      `but the enterprise requires ${requestedM2.toFixed(0)} m²`,
      422,
      'LAND_LIMIT_EXCEEDED',
      { landPlotId, availableM2, requestedM2 },
    );
  }
}

/**
 * Площа обладнання перевищує площу підлоги цеху.
 */
export class WorkshopCapacityExceededError extends AppError {
  constructor(workshopId: string, totalM2: number, usedM2: number, newM2: number) {
    super(
      `Workshop '${workshopId}': floor area would be exceeded ` +
      `(${usedM2.toFixed(0)} m² in use + ${newM2.toFixed(0)} m² requested > ` +
      `${totalM2.toFixed(0)} m² total)`,
      422,
      'WORKSHOP_CAPACITY_EXCEEDED',
      { workshopId, totalM2, usedM2, newM2 },
    );
  }
}

/**
 * Ділянка не є доступною для придбання/оренди (вже зайнята або статус не AVAILABLE).
 */
export class LandNotAvailableError extends AppError {
  constructor(landPlotId: string, currentStatus: string) {
    super(
      `Land plot '${landPlotId}' is not available for acquisition (status: ${currentStatus})`,
      422,
      'LAND_NOT_AVAILABLE',
      { landPlotId, currentStatus },
    );
  }
}

/**
 * Атомарний CAS конфлікт при виконанні B2B угоди (гонка конкурентних транзакцій).
 */
export class ConcurrentConflictError extends AppError {
  constructor(resource: string, detail?: string) {
    super(
      `Concurrent modification on '${resource}'` + (detail ? `: ${detail}` : ''),
      409,
      'CONCURRENT_CONFLICT',
      { resource },
    );
  }
}
