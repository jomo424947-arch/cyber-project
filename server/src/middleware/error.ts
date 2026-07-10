import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../lib/errors';

/** 404 handler for unmatched routes. */
export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { message: 'Route not found' } });
}

/** Centralized error handler — normalizes ApiError, ZodError, and unknown errors. */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({
      error: { message: err.message, code: err.code },
    });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        issues: err.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      },
    });
  }

  console.error('[error] unhandled:', err);
  const message = err instanceof Error ? err.message : 'Internal server error';
  return res.status(500).json({ error: { message, code: 'INTERNAL' } });
}