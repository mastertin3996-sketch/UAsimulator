/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset:          'ts-jest',
  testEnvironment: 'node',
  roots:           ['<rootDir>/src'],
  testMatch:       ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {},
  coverageProvider: 'v8',
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
};
