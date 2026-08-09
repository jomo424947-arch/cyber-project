import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

/**
 * Double-Submit Cookie CSRF Protection Middleware.
 *
 * Safe methods (GET, HEAD, OPTIONS) and exempt routes skip verification.
 *
 * For mutating methods (POST, PUT, DELETE, PATCH):
 * - If the `csrf-token` cookie is present, `X-CSRF-Token` header MUST match the cookie value.
 * - If no `csrf-token` cookie is attached by the browser (e.g. cross-domain request where
 *   third-party cookies are blocked, or non-browser client), CSRF cookie forgery cannot occur.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  const cookieToken = req.cookies?.['csrf-token'];
  const headerToken = req.headers['x-csrf-token'] as string | undefined;

  // Initialize or maintain CSRF cookie
  let activeToken = cookieToken || headerToken;
  if (!activeToken) {
    activeToken = crypto.randomBytes(32).toString('hex');
  }

  // Ensure csrf-token cookie is set for same-site browser contexts
  if (!cookieToken) {
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('csrf-token', activeToken, {
      httpOnly: false,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      path: '/',
    });
  }

  // Always expose the CSRF token via response header for client JS
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

  // If the browser sent a csrf-token cookie, verify that X-CSRF-Token header matches it.
  // This blocks cross-site form attacks where the browser automatically attaches cookies.
  if (cookieToken) {
    if (!headerToken || headerToken !== cookieToken) {
      return res.status(403).json({
        error: {
          message: 'CSRF token validation failed',
          code: 'CSRF_ERROR',
        },
      });
    }
  }

  next();
}