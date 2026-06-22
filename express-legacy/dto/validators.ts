import { ValidationError } from '../errors/AppError';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requireString(value: unknown, field: string, maxLen = 200): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`"${field}" is required and must be a non-empty string`);
  }
  if (value.length > maxLen) {
    throw new ValidationError(`"${field}" must be at most ${maxLen} characters, got ${value.length}`);
  }
  return value.trim();
}

export function requireUUID(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new ValidationError(`"${field}" must be a valid UUID, got: ${String(value)}`);
  }
  return value;
}

export function requirePositiveNumber(value: unknown, field: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new ValidationError(`"${field}" must be a positive finite number, got: ${String(value)}`);
  }
  return n;
}

export function requireNonNegativeNumber(value: unknown, field: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new ValidationError(`"${field}" must be ≥ 0, got: ${String(value)}`);
  }
  return n;
}

export function requireEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
): T {
  if (!allowed.includes(value as T)) {
    throw new ValidationError(
      `"${field}" must be one of [${allowed.join(', ')}], got: ${String(value)}`,
    );
  }
  return value as T;
}

export function requireUUIDArray(value: unknown, field: string, minLen = 1): string[] {
  if (!Array.isArray(value) || value.length < minLen) {
    throw new ValidationError(
      `"${field}" must be a non-empty array of UUIDs (min ${minLen} element(s))`,
    );
  }
  return value.map((v, i) => requireUUID(v, `${field}[${i}]`));
}

export function requireOptionalPositiveNumber(
  value: unknown,
  field: string,
): number | undefined {
  if (value === undefined || value === null) return undefined;
  return requirePositiveNumber(value, field);
}

/** Validates the raw request body is a plain object (not array, null, etc.). */
export function requireBody(body: unknown, endpoint: string): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError(
      `${endpoint}: request body must be a JSON object`,
    );
  }
  return body as Record<string, unknown>;
}
