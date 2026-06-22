/**
 * Vercel Serverless entry-point.
 * Seeds the tech tree on cold start (idempotent upserts, safe to repeat).
 */
import app            from '../src/app';
import { prisma }     from '../src/lib/prisma';
import { ResearchDevelopmentService } from '../src/services/ResearchDevelopmentService';

new ResearchDevelopmentService(prisma).seedTechTree().catch(console.error);

export default app;
