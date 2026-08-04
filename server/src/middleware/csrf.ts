import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

/**
 * CSRF Protection Middleware.
 *
 * Safe methods (GET, HEAD, OPTIONS) and exempt routes skip verification.
 *
 * For mutating methods (POST, PUT, DELETE, PATCH):
 * A request is safe and allowed if it carries a custom `X-CSRF-Token` header
 * or `Authorization` header (custom HTTP headers cannot be set in cross-origin
 * CSRF form attacks without CORS preflight approval).
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

  // Verify CSRF protection for mutating methods:
  // Custom headers (X-CSRF-Token or Authorization) cannot be forged in cross-site CSRF attacks
  const hasAuthHeader = !!req.headers.authorization;
  const hasCsrfHeader = !!headerToken && headerToken.trim().length > 0;

  if (!hasCsrfHeader && !hasAuthHeader) {
    return res.status(403).json({
      error: {
        message: 'CSRF token validation failed',
        code: 'CSRF_ERROR',
      },
    });
  }

  next();
}


