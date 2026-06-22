/**
 * Vercel Serverless entry-point.
 * Seeds the tech tree on cold start (idempotent upserts, safe to repeat).
 */
import app            from '../src/app';
import { prisma }     from '../src/lib/prisma';
import { ResearchDevelopmentService } from '../src/services/ResearchDevelopmentService';
import { FiscalBudgetService }        from '../src/services/FiscalBudgetService';
import { ForeignTradeService }        from '../src/services/ForeignTradeService';

new ResearchDevelopmentService(prisma).seedTechTree().catch(console.error);
new FiscalBudgetService(prisma).seedSubsidyPrograms().catch(console.error);
const _foreign = new ForeignTradeService(prisma);
_foreign.seedTickers().catch(console.error);
_foreign.seedFxRate().catch(console.error);

export default app;
