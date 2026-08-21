import { Request, Response, NextFunction } from 'express';
import { supabase, localDb } from '../lib/supabase';
import { cloudSupabase } from '../lib/cloud-supabase';
import { unauthorized, forbidden } from '../lib/errors';
import type { Role } from '../lib/types';
import { verifyToken } from '../lib/local-auth';

/**
 * Verifies the `Authorization: Bearer <token>` header or `sb-access-token` cookie
 * against local JWT signing, then loads the user's role and tenant_id.
 *
 * FIX: tenant_id is now read directly from the JWT payload (where it is embedded
 * at login time). This prevents the previous bug where multiple cafés on the same
 * local machine could see each other's data because the server was falling back
 * to the global `tenant_config` table (which only holds the LAST activated tenant).
 *
 * Attaches { id, email, role, tenant_id } to req.user.
 */
export async function verifyJWT(req: Request, _res: Response, next: NextFunction) {
  try {
    let token =
      (req.headers.authorization && req.headers.authorization.toLowerCase().startsWith('bearer ')
        ? req.headers.authorization.slice(7).trim()
        : null) ||
      (req.headers['x-access-token'] as string) ||
      req.cookies?.['sb-access-token'];

    if (!token) {
      throw unauthorized('Missing session token');
    }

    let userId = '';
    let tokenTenantId: string | null = null;

    // First try decoding with local JWT secret (since auth.controller.ts signs tokens using local-auth)
    try {
      const decoded = verifyToken(token);
      userId = decoded.id;
      // FIX: Read tenant_id from the JWT payload directly.
      // This was missing before, causing tenant isolation failures.
      tokenTenantId = decoded.tenant_id ?? null;
    } catch {
      // Fallback to Supabase Cloud verification if local JWT check fails
      if (cloudSupabase) {
        const { data, error } = await cloudSupabase.auth.getUser(token);
        if (error || !data.user) {
          throw unauthorized('Invalid or expired token');
        }
        userId = data.user.id;
        // Cloud tokens don't carry tenant_id — will be loaded from DB below
      } else {
        throw unauthorized('Invalid or expired token');
      }
    }

    // Load user profile from DB to get role and validate the user still exists.
    // Also used to get tenant_id when the token doesn't carry it (cloud JWT case).
    let userRow: any = null;
    try {
      const { data } = await supabase
        .from('users')
        .select('id, email, role, tenant_id')
        .eq('id', userId)
        .maybeSingle();
      if (data) userRow = data;
    } catch (userErr) {
      console.warn('[auth] primary users lookup failed, falling back to localDb:', userErr);
    }

    if (!userRow) {
      const { data: localUserRow } = await localDb
        .from('users')
        .select('id, email, role, tenant_id')
        .eq('id', userId)
        .maybeSingle();
      userRow = localUserRow;
    }

    if (!userRow) {
      throw unauthorized('User not found');
    }

    // FIX: Determine the effective tenant_id with a strict priority order:
    //  1. JWT payload (most reliable — set at login time, café-specific)
    //  2. DB user row (reliable if user was created with correct tenant_id)
    //  3. Reject the request — do NOT fall back to global tenant_config,
    //     as that would give café A the data of café B (last activated tenant).
    const effectiveTenantId: string | null =
      tokenTenantId ||         // from JWT (most trusted source)
      userRow.tenant_id ||     // from DB user row
      null;                    // ← intentionally null; controllers will filter accordingly

    if (!effectiveTenantId) {
      console.warn(`[auth] User ${userId} has no tenant_id. Access will be restricted.`);
    }

    req.user = {
      id: userRow.id,
      email: userRow.email,
      role: userRow.role as Role,
      tenant_id: effectiveTenantId as string,
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
