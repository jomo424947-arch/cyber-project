import { Request, Response } from 'express';
import { supabase, localDb } from '../lib/supabase';
import { badRequest, unauthorized, conflict } from '../lib/errors';
import { hashPassword } from '../lib/local-auth';
import { cloudSupabase } from '../lib/cloud-supabase';
import { getDb, saveDatabase } from '../lib/database';
import crypto from 'crypto';

/**
 * GET /api/employees
 * List all registered employees.
 * Returns local data immediately; cloud sync runs in the background.
 */
export async function listEmployees(req: Request, res: Response) {
  const tenantId = req.user?.tenant_id;

  if (!tenantId) {
    // Fail-safe: no tenant = no data (prevents cross-tenant leaks if tenant_id is null)
    res.json([]);
    return;
  }

  const db = getDb();

  // Return local data immediately
  let query = localDb.from('users').select('id, email, full_name, role, created_at').eq('tenant_id', tenantId);
  const { data: users, error } = await query;

  if (error) throw badRequest(error.message);
  res.json(users);

  // Fire-and-forget: sync from cloud in the background
  if (cloudSupabase && tenantId) {
    syncEmployeesFromCloud(db, tenantId).catch((err) => {
      console.warn('[employees] Background cloud sync failed:', err.message);
    });
  }
}

/**
 * POST /api/employees
 * Create a new employee (Admin only).
 */
export async function createEmployee(req: Request, res: Response) {
  const { email, password, full_name, role } = req.body;

  if (!email || !password || !role) {
    throw badRequest('Email, password, and role are required');
  }

  const cleanEmail = email.trim().toLowerCase();
  const tenantId = req.user?.tenant_id;

  if (!tenantId) {
    throw badRequest('Cannot create employee: your account has no tenant association');
  }

  const db = getDb();

  // Check if email already exists locally in this tenant
  const { data: existingUser } = await localDb.from('users').select('id').eq('email', cleanEmail).eq('tenant_id', tenantId).maybeSingle();

  if (existingUser) {
    throw conflict('An employee with this email already exists');
  }

  const passwordHash = hashPassword(password);
  let userId = crypto.randomUUID();

  // Try creating in Supabase Cloud if cloudSupabase is configured
  if (cloudSupabase) {
    try {
      const { data: authData, error: authErr } = await cloudSupabase.auth.admin.createUser({
        email: cleanEmail,
        password,
        email_confirm: true,
      });

      if (authErr && !authErr.message.includes('already registered')) {
        console.warn('[employees] Cloud Auth createUser warning:', authErr.message);
      } else if (authData?.user) {
        userId = authData.user.id as any;
      }

      // Upsert profile in Supabase Cloud users table
      const { error: cloudDbErr } = await cloudSupabase.from('users').upsert({
        id: userId,
        email: cleanEmail,
        full_name: full_name || cleanEmail.split('@')[0],
        role,
        tenant_id: tenantId,
      });

      if (cloudDbErr) {
        console.warn('[employees] Cloud users upsert failed:', cloudDbErr.message);
      } else {
        console.log(`[employees] Employee ${cleanEmail} created/synced successfully to Supabase Cloud.`);
      }
    } catch (cloudErr: any) {
      console.warn('[employees] Cloud sync failed during creation, caching locally:', cloudErr.message);
    }
  }

  // Save/cache locally in SQLite for offline access
  db.run(
    `INSERT OR REPLACE INTO users (id, email, full_name, role, password_hash, tenant_id) VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, cleanEmail, full_name || cleanEmail.split('@')[0], role, passwordHash, tenantId]
  );
  saveDatabase();

  res.status(201).json({ id: userId, email: cleanEmail, full_name, role });
}

/**
 * PATCH /api/employees/:id
 * Update an existing employee (Admin only).
 */
export async function updateEmployee(req: Request, res: Response) {
  const { id } = req.params;
  const { full_name, role, password } = req.body;
  const tenantId = req.user?.tenant_id;

  if (!tenantId) {
    throw badRequest('Cannot update employee: your account has no tenant association');
  }

  const db = getDb();

  if (cloudSupabase) {
    try {
      if (password) {
        await cloudSupabase.auth.admin.updateUserById(id, { password });
      }
      await cloudSupabase.from('users').update({ full_name, role }).eq('id', id).eq('tenant_id', tenantId);
    } catch (err: any) {
      console.warn('[employees] Cloud update failed:', err.message);
    }
  }

  // Update locally in SQLite
  const patch: any = {};
  if (full_name !== undefined) patch.full_name = full_name;
  if (role !== undefined) patch.role = role;
  if (password) {
    patch.password_hash = hashPassword(password);
  }

  const { data, error } = await localDb.from('users').update(patch).eq('id', id).eq('tenant_id', tenantId).select().maybeSingle();

  if (error) throw badRequest(error.message);
  if (!data) throw badRequest('Employee not found or access denied');
  saveDatabase();
  res.json(data);
}

/**
 * DELETE /api/employees/:id
 * Delete an employee (Admin only).
 */
export async function deleteEmployee(req: Request, res: Response) {
  const { id } = req.params;
  const tenantId = req.user?.tenant_id;

  if (!tenantId) {
    throw badRequest('Cannot delete employee: your account has no tenant association');
  }

  if (id === req.user?.id) {
    throw badRequest('You cannot delete your own account');
  }

  if (cloudSupabase) {
    try {
      await cloudSupabase.auth.admin.deleteUser(id);
      await cloudSupabase.from('users').delete().eq('id', id).eq('tenant_id', tenantId);
      console.log(`[employees] Employee ${id} deleted from Supabase Cloud.`);
    } catch (err: any) {
      console.warn('[employees] Cloud delete warning:', err.message);
    }
  }

  // Delete locally from SQLite
  const { error } = await localDb.from('users').delete().eq('id', id).eq('tenant_id', tenantId);

  if (error) throw badRequest(error.message);
  saveDatabase();
  res.json({ message: 'Employee deleted successfully' });
}

/**
 * GET /api/auth/employees-public
 * Public list of registered employees for login dropdown.
 *
 * Returns local SQLite data immediately so the login dropdown works
 * even when offline. Cloud sync runs in the background (fire-and-forget).
 */
export async function listEmployeesPublic(req: Request, res: Response) {
  const db = getDb();
  let tenantId: string | null = null;

  // 1. Get active tenant_id from local configuration
  try {
    const stmt = db.prepare('SELECT tenant_id FROM tenant_config LIMIT 1');
    if (stmt.step()) {
      tenantId = stmt.getAsObject().tenant_id as string;
    }
    stmt.free();
  } catch (err) {}

  if (!tenantId) {
    res.json({ users: [] });
    return;
  }

  // 2. Return local data immediately (scoped to local active tenant)
  const { data: users, error } = await localDb
    .from('users')
    .select('id, email, full_name, role')
    .eq('tenant_id', tenantId);

  if (error) throw badRequest(error.message);
  res.json({ users: users || [] });

  // 3. Fire-and-forget: sync employees from cloud in the background
  if (cloudSupabase && tenantId) {
    syncEmployeesFromCloud(db, tenantId).catch((err) => {
      console.warn('[employees-public] Background cloud sync failed:', err.message);
    });
  }
}

/** Background helper: pull employees from Supabase Cloud and cache locally. */
async function syncEmployeesFromCloud(db: ReturnType<typeof getDb>, tenantId: string) {
  if (!cloudSupabase) return;

  // Use a 3-second timeout via AbortController so we don't hang when offline
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);

  try {
    const { data: cloudUsers, error: cloudErr } = await cloudSupabase
      .from('users')
      .select('id, email, full_name, role, tenant_id')
      .eq('tenant_id', tenantId)
      .abortSignal(controller.signal);

    clearTimeout(timer);

    // FIX: Guard against empty result due to network errors, RLS misconfigurations,
    // or temporary cloud issues. If cloud returns null or an error, skip the sync
    // entirely to prevent deleting all local users.
    if (cloudErr) {
      console.warn('[employees-public] Cloud sync skipped due to error:', cloudErr.message);
      return;
    }

    if (cloudUsers === null) {
      console.warn('[employees-public] Cloud returned null users list. Skipping sync to prevent data loss.');
      return;
    }

    // FIX: If cloud returns an EMPTY array, this could mean:
    // 1. RLS policy is blocking the query (returns 0 rows instead of error)
    // 2. All users were genuinely deleted from cloud
    // To be safe, we ONLY delete local users if cloud returned at least 1 user.
    // Deleting all local users when offline would lock everyone out.
    if (cloudUsers.length === 0) {
      console.warn(
        `[employees-public] Cloud returned 0 users for tenant ${tenantId}. ` +
        'Skipping local delete to prevent accidental lockout. ' +
        'If intentional, delete users manually from the admin panel.'
      );
      return;
    }

    // Safe to sync: cloud returned valid user data
    const cloudIds = cloudUsers.map((u) => u.id);
    const placeholders = cloudIds.map(() => '?').join(',');

    // Remove local users that no longer exist in cloud
    db.run(`DELETE FROM users WHERE tenant_id = ? AND id NOT IN (${placeholders})`, [tenantId, ...cloudIds]);

    for (const cu of cloudUsers) {
      // Preserve existing local password_hash so the user can still log in offline
      const stmtCheck = db.prepare('SELECT password_hash FROM users WHERE id = ?');
      stmtCheck.bind([cu.id]);
      let existingHash: string | null = null;
      if (stmtCheck.step()) {
        existingHash = stmtCheck.getAsObject().password_hash as string;
      }
      stmtCheck.free();

      db.run(
        `INSERT OR REPLACE INTO users (id, email, full_name, role, password_hash, tenant_id) VALUES (?, ?, ?, ?, ?, ?)`,
        [cu.id, cu.email, cu.full_name || cu.email.split('@')[0], cu.role, existingHash || null, cu.tenant_id]
      );
    }

    saveDatabase();
    console.log(`[employees-public] Synced ${cloudUsers.length} user(s) from cloud.`);
  } catch (err: any) {
    clearTimeout(timer);
    console.warn('[employees-public] Cloud sync skipped:', err.message);
  }
}
