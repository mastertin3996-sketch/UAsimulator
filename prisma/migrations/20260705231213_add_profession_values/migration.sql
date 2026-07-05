-- AlterEnum
-- Adds 14 new Profession values for the all-sphere content+mechanics expansion.
-- Additive & inert until code references them. Postgres 12+ (Neon) applies all in one migration.
ALTER TYPE "Profession" ADD VALUE 'MILLER';
ALTER TYPE "Profession" ADD VALUE 'BAKER';
ALTER TYPE "Profession" ADD VALUE 'BUTCHER';
ALTER TYPE "Profession" ADD VALUE 'CHEESEMAKER';
ALTER TYPE "Profession" ADD VALUE 'BREWER';
ALTER TYPE "Profession" ADD VALUE 'SPINNER';
ALTER TYPE "Profession" ADD VALUE 'GARMENT_WORKER';
ALTER TYPE "Profession" ADD VALUE 'DYER';
ALTER TYPE "Profession" ADD VALUE 'WAREHOUSE_MANAGER';
ALTER TYPE "Profession" ADD VALUE 'FORKLIFT_OPERATOR';
ALTER TYPE "Profession" ADD VALUE 'INVENTORY_CLERK';
ALTER TYPE "Profession" ADD VALUE 'DISPATCHER';
ALTER TYPE "Profession" ADD VALUE 'MECHANIC';
ALTER TYPE "Profession" ADD VALUE 'LOGISTICIAN';
