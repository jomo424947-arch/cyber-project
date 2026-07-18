import { Request, Response, NextFunction } from 'express';
import { supabase } from '../lib/supabase';
import { unauthorized, forbidden } from '../lib/errors';
import type { Role } from '../lib/types';

/**
 * Verifies the `Authorization: Bearer <token>` header against Supabase Auth,
 * then loads the user's role from the public.users table.
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

    // Validate the JWT against Supabase.
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      throw unauthorized('Invalid or expired token');
    }

    // Look up the role from our users table.
    const { data: userRow, error: userErr } = await supabase
      .from('users')
      .select('id, email, role')
      .eq('id', data.user.id)
      .maybeSingle();

    // Fail closed on a genuine query error — do NOT default to 'staff'.
    if (userErr) {
      console.error('[auth] users lookup failed:', userErr.message);
      throw unauthorized('Authentication failed — please try again');
    }

    // Fall back to 'staff' only if the row doesn't exist yet (e.g. signup race).
    req.user = {
      id: data.user.id,
      email: data.user.email ?? userRow?.email ?? '',
      role: (userRow?.role ?? 'staff') as Role,
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
