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
  const db = getDb();

  // Return local data immediately
  let query = localDb.from('users').select('id, email, full_name, role, created_at');
  if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  }
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
  const db = getDb();
  let tenantId = req.user?.tenant_id || null;

  if (!tenantId) {
    try {
      const stmt = db.prepare('SELECT tenant_id FROM tenant_config LIMIT 1');
      if (stmt.step()) {
        tenantId = stmt.getAsObject().tenant_id as string;
      }
      stmt.free();
    } catch (err) {}
  }

  // Check if email already exists locally in this tenant
  let checkQuery = localDb.from('users').select('id').eq('email', cleanEmail);
  if (tenantId) {
    checkQuery = checkQuery.eq('tenant_id', tenantId);
  }
  const { data: existingUser } = await checkQuery.maybeSingle();

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
  const db = getDb();

  if (cloudSupabase) {
    try {
      if (password) {
        await cloudSupabase.auth.admin.updateUserById(id, { password });
      }
      let cloudUpdate = cloudSupabase.from('users').update({ full_name, role }).eq('id', id);
      if (tenantId) cloudUpdate = cloudUpdate.eq('tenant_id', tenantId);
      await cloudUpdate;
    } catch (err: any) {
      console.warn('[employees] Cloud update failed:', err.message);
    }
  }

  // Update locally in SQLite
  const patch: any = { full_name, role };
  if (password) {
    patch.password_hash = hashPassword(password);
  }

  let localUpdate = localDb.from('users').update(patch).eq('id', id);
  if (tenantId) {
    localUpdate = localUpdate.eq('tenant_id', tenantId);
  }

  const { data, error } = await localUpdate.select().maybeSingle();

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

  if (id === req.user?.id) {
    throw badRequest('You cannot delete your own account');
  }

  if (cloudSupabase) {
    try {
      await cloudSupabase.auth.admin.deleteUser(id);
      let cloudDel = cloudSupabase.from('users').delete().eq('id', id);
      if (tenantId) cloudDel = cloudDel.eq('tenant_id', tenantId);
      await cloudDel;
      console.log(`[employees] Employee ${id} deleted from Supabase Cloud.`);
    } catch (err: any) {
      console.warn('[employees] Cloud delete warning:', err.message);
    }
  }

  // Delete locally from SQLite
  let localDel = localDb.from('users').delete().eq('id', id);
  if (tenantId) {
    localDel = localDel.eq('tenant_id', tenantId);
  }

  const { error } = await localDel;

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

  // 2. Return local data immediately (scoped to local active tenant if available)
  let query = localDb.from('users').select('id, email, full_name, role');
  if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  }
  const { data: users, error } = await query;

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
    const { data: cloudUsers } = await cloudSupabase
      .from('users')
      .select('id, email, full_name, role, tenant_id')
      .eq('tenant_id', tenantId)
      .abortSignal(controller.signal);

    clearTimeout(timer);

    if (cloudUsers !== null) {
      if (cloudUsers.length > 0) {
        const cloudIds = cloudUsers.map((u) => u.id);
        const placeholders = cloudIds.map(() => '?').join(',');
        db.run(`DELETE FROM users WHERE tenant_id = ? AND id NOT IN (${placeholders})`, [tenantId, ...cloudIds]);

        for (const cu of cloudUsers) {
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
      } else {
        db.run(`DELETE FROM users WHERE tenant_id = ?`, [tenantId]);
      }
      saveDatabase();
      console.log(`[employees-public] Synced ${cloudUsers.length} user(s) from cloud.`);
    }
  } catch (err: any) {
    clearTimeout(timer);
    console.warn('[employees-public] Cloud sync skipped:', err.message);
  }
}
