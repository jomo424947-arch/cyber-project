import { Request, Response, NextFunction } from 'express';
import { getDb } from '../lib/database';

/**
 * Middleware that restricts API access until the application is activated.
 *
 * Safe paths (health check, activation status, activation endpoint) are exempt.
 * Returns 402 Payment Required with custom error codes if license is missing or suspended.
 */
export function licenseCheck(req: Request, res: Response, next: NextFunction) {
  // Allow all static frontend assets (non-API paths) to be served
  if (!req.path.startsWith('/api')) {
    return next();
  }

  // Allow all authentication and tenant routes to be accessed even if unactivated
  if (req.path.startsWith('/api/auth')) {
    return next();
  }

  const exemptPaths = [
    '/health',
  ];

  if (
    exemptPaths.includes(req.path) ||
    exemptPaths.includes(req.originalUrl)
  ) {
    return next();
  }

  try {
    const db = getDb();
    let status = 'unactivated';

    const stmt = db.prepare('SELECT status FROM tenant_config LIMIT 1');
    if (stmt.step()) {
      status = stmt.getAsObject().status as string;
    }
    stmt.free();

    if (status === 'unactivated') {
      return res.status(402).json({
        error: {
          message: 'Application not activated. Please activate your license to continue.',
          code: 'LICENSE_REQUIRED',
        },
      });
    }

    if (status === 'suspended') {
      return res.status(402).json({
        error: {
          message: 'Your subscription is suspended. Please contact support to renew.',
          code: 'LICENSE_SUSPENDED',
        },
      });
    }
  } catch (err) {
    // If the database isn't fully ready or table doesn't exist, we consider it unactivated
    return res.status(402).json({
      error: {
        message: 'Application not activated. Please activate your license to continue.',
        code: 'LICENSE_REQUIRED',
      },
    });
  }

  next();
}
