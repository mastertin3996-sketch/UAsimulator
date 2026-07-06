-- AlterEnum
-- Adds HEAVY_INDUSTRY enterprise type + STEELWORKER/CARPENTER professions.
-- Fixes the pre-existing data issue where Steel/Sawmill/Furniture recipes were
-- placed under TEXTILE_FACTORY ("closest available type" at the time they were added).
-- Additive & inert until code/data references them. Postgres 12+ (Neon) applies all in one migration.
ALTER TYPE "EnterpriseType" ADD VALUE 'HEAVY_INDUSTRY';
ALTER TYPE "Profession" ADD VALUE 'STEELWORKER';
ALTER TYPE "Profession" ADD VALUE 'CARPENTER';
