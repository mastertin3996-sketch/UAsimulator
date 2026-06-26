import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
await p.$executeRaw`ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "isAccreditedSupplier" BOOLEAN NOT NULL DEFAULT false`;
console.log('Column added');
await p.$disconnect();
