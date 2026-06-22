import app from './app';
import { prisma } from './lib/prisma';
import { ResearchDevelopmentService } from './services/ResearchDevelopmentService';

const PORT = Number(process.env.PORT) || 3001;

async function bootstrap(): Promise<void> {
  await new ResearchDevelopmentService(prisma).seedTechTree();
  app.listen(PORT, () => {
    console.log(`UAeconomy API → http://localhost:${PORT}`);
    console.log(`Health:         http://localhost:${PORT}/health`);
  });
}

bootstrap().catch(err => { console.error('Startup failed:', err); process.exit(1); });
