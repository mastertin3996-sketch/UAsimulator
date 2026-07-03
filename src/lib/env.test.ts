import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateEnv } from './env';

const REQUIRED_KEYS = ['DATABASE_URL', 'NEXTAUTH_SECRET', 'NEXTAUTH_URL', 'CRON_SECRET'] as const;

describe('validateEnv', () => {
  let original: Record<string, string | undefined>;

  beforeEach(() => {
    original = {};
    for (const key of REQUIRED_KEYS) original[key] = process.env[key];
  });

  afterEach(() => {
    for (const key of REQUIRED_KEYS) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });

  it('passes when all required vars are set', () => {
    for (const key of REQUIRED_KEYS) process.env[key] = 'placeholder-value';
    expect(() => validateEnv()).not.toThrow();
  });

  it('throws a single error listing every missing var', () => {
    for (const key of REQUIRED_KEYS) delete process.env[key];
    try {
      validateEnv();
      expect.unreachable('validateEnv should have thrown');
    } catch (e) {
      const message = (e as Error).message;
      for (const key of REQUIRED_KEYS) expect(message).toContain(key);
    }
  });

  it('throws when only one required var is missing', () => {
    for (const key of REQUIRED_KEYS) process.env[key] = 'placeholder-value';
    delete process.env.CRON_SECRET;
    expect(() => validateEnv()).toThrow(/CRON_SECRET/);
  });
});
