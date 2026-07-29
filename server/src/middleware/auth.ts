import { Request, Response, NextFunction } from 'express';
import { supabase } from '../lib/supabase';
import { unauthorized, forbidden } from '../lib/errors';
import type { Role } from '../lib/types';
import { verifyToken } from '../lib/local-auth';

/**
 * Verifies the `Authorization: Bearer <token>` header or `sb-access-token` cookie
 * against local JWT signing, then loads the user's role from the local users table.
 * Attaches { id, email, role } to req.user.
 */
export async function verifyJWT(req: Request, _res: Response, next: NextFunction) {
  try {
    let token = req.cookies?.['sb-access-token'];

    // Fallback to Authorization header if cookie is not present (e.g. for API testing tools)
    if (!token) {
      const header = req.headers.authorization;
      if (header && header.toLowerCase().startsWith('bearer ')) {
        token = header.slice(7).trim();
      }
    }

    if (!token) {
      throw unauthorized('Missing session token');
    }

    const isOffline = process.env.OFFLINE_MODE === 'true';
    let userId = '';

    if (isOffline) {
      // Validate the local JWT.
      try {
        const decoded = verifyToken(token);
        userId = decoded.id;
      } catch (err) {
        throw unauthorized('Invalid or expired token');
      }
    } else {
      // Validate the JWT against Supabase Cloud.
      const { data, error } = await (supabase as any).auth.getUser(token);
      if (error || !data.user) {
        throw unauthorized('Invalid or expired token');
      }
      userId = data.user.id;
    }

    // Look up the role and tenant_id from our users table.
    const { data: userRow, error: userErr } = await supabase
      .from('users')
      .select('id, email, role, tenant_id')
      .eq('id', userId)
      .maybeSingle();

    // Fail closed on a genuine query error — do NOT default to 'staff'.
    if (userErr) {
      console.error('[auth] users lookup failed:', userErr.message);
      throw unauthorized('Authentication failed — please try again');
    }

    if (!userRow) {
      throw unauthorized('User not found');
    }

    let effectiveTenantId = userRow.tenant_id;
    if (!effectiveTenantId) {
      const { data: tenantConfig } = await supabase.from('tenant_config').select('tenant_id').maybeSingle();
      if (tenantConfig?.tenant_id) {
        effectiveTenantId = tenantConfig.tenant_id;
      }
    }

    req.user = {
      id: userRow.id,
      email: userRow.email,
      role: userRow.role as Role,
      tenant_id: effectiveTenantId,
    };

    next();
  } catch (err) {
    next(err);
  }
}

/** Restricts a route to one or more roles. Must run after verifyJWT. */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden('Insufficient role'));
    next();
  };
}
