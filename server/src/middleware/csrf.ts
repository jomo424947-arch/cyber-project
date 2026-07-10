import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

/**
 * Double-Submit Cookie CSRF protection middleware.
 *
 * Safe methods (GET, HEAD, OPTIONS) do not alter server state and are allowed.
 * For mutating methods (POST, PUT, DELETE, PATCH), we verify that the value
 * in the 'csrf-token' cookie matches the 'X-CSRF-Token' header.
 *
 * If the 'csrf-token' cookie is missing, we initialize one.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  // 1. Initialize CSRF cookie if it doesn't exist
  let csrfToken = req.cookies?.['csrf-token'];
  if (!csrfToken) {
    csrfToken = crypto.randomBytes(32).toString('hex');
    res.cookie('csrf-token', csrfToken, {
      httpOnly: false, // Must be readable by client JS to attach to headers
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
  }

  // 2. Skip verification for safe methods
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  // 3. Verify CSRF token for mutating methods
  const headerToken = req.headers['x-csrf-token'];
  if (!headerToken || headerToken !== csrfToken) {
    return res.status(403).json({
      error: {
        message: 'CSRF token validation failed',
        code: 'CSRF_ERROR',
      },
    });
  }

  next();
}
