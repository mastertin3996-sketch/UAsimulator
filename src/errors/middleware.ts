import type { Request, Response, NextFunction } from 'express';
import { AppError } from './AppError';

/** Нормалізує помилку в JSON-відповідь із полями code / message / meta. */
export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      code:    err.code,
      message: err.message,
      ...(err.meta ? { details: err.meta } : {}),
    });
    return;
  }

  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({
      success: false,
      code:    'INVALID_JSON',
      message: 'Request body is not valid JSON',
    });
    return;
  }

  // Незнайомі помилки — 500 без витоку деталей у production
  const isDev = process.env.NODE_ENV === 'development';
  console.error('[UAeconomy] Unhandled error:', err);

  res.status(500).json({
    success: false,
    code:    'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
    ...(isDev && err instanceof Error ? { debug: err.message, stack: err.stack } : {}),
  });
}
