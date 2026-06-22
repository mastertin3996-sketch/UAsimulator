import express, { type Request, type Response } from 'express';
import { prisma }           from './lib/prisma';
import { buildRouter }      from './routes';
import { errorMiddleware }  from './errors/middleware';

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());
app.use((_req, res, next) => {
  const origin = process.env.CORS_ORIGIN ?? '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  next();
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() });
});

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api', buildRouter(prisma));

// ── Error handling ────────────────────────────────────────────────────────────
app.use(errorMiddleware);

export default app;
