import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

/**
 * CSRF Protection Middleware.
 *
 * Safe methods (GET, HEAD, OPTIONS) do not alter server state and are allowed.
 * Exempt auth/health routes skip verification.
 *
 * Verification rules for mutating requests (POST, PUT, DELETE, PATCH):
 * 1. If `csrf-token` cookie is present, `X-CSRF-Token` header MUST match the cookie token.
 * 2. If `csrf-token` cookie is NOT present (e.g. cross-domain SPA where third-party cookies are blocked),
 *    the request MUST present a non-empty `X-CSRF-Token` header or `Authorization` header.
 *    (Custom headers cannot be set in cross-origin CSRF attacks without CORS preflight approval).
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  const cookieToken = req.cookies?.['csrf-token'];
  const headerToken = req.headers['x-csrf-token'] as string | undefined;

  // Determine active token to expose in response header
  let activeToken = cookieToken || headerToken;
  if (!activeToken) {
    activeToken = crypto.randomBytes(32).toString('hex');
  }

  // Set cookie if missing
  if (!cookieToken) {
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('csrf-token', activeToken, {
      httpOnly: false,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      path: '/',
    });
  }

  // Always expose the CSRF token via response header for cross-domain client JS
  if (typeof res.setHeader === 'function') {
    res.setHeader('X-CSRF-Token', activeToken);
  }

  // Skip verification for safe methods and auth entry points
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  const exemptPaths = [
    '/api/auth/login',
    '/api/auth/signup',
    '/api/auth/refresh',
    '/api/auth/logout',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
    '/api/auth/activate',
    '/health',
  ];

  const isSuperAdminExempt = 
    req.path === '/api/auth/register-tenant' || 
    (req.path.startsWith('/api/auth/tenants/') && req.path.endsWith('/status'));

  if (
    safeMethods.includes(req.method) ||
    exemptPaths.includes(req.path) ||
    exemptPaths.includes(req.originalUrl) ||
    isSuperAdminExempt
  ) {
    return next();
  }

  // Verify CSRF token for mutating methods
  // Case A: Cookie IS present -> headerToken MUST match cookieToken
  if (cookieToken) {
    if (!headerToken || headerToken !== cookieToken) {
      return res.status(403).json({
        error: {
          message: 'CSRF token validation failed',
          code: 'CSRF_ERROR',
        },
      });
    }
    return next();
  }

  // Case B: Cookie is NOT present (e.g. cross-site request where third-party cookie was blocked by browser)
  // Request is safe if it carries custom X-CSRF-Token header or Authorization header
  const hasAuthHeader = !!req.headers.authorization;
  if (!headerToken && !hasAuthHeader) {
    return res.status(403).json({
      error: {
        message: 'CSRF token validation failed',
        code: 'CSRF_ERROR',
      },
    });
  }

  next();
}

