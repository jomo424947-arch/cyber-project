import { cloudSupabase } from './cloud-supabase';
import { getDb, saveDatabase } from './database';

let _syncInterval: ReturnType<typeof setInterval> | null = null;
let _isSyncing = false;

/** Check if we can connect to the Supabase cloud. */
async function checkOnline(): Promise<boolean> {
  if (!cloudSupabase) return false;
  try {
    // Probe cloud health
    const { error } = await cloudSupabase.from('devices').select('id').limit(1);
    return !error;
  } catch {
    return false;
  }
}

/** Check local tenant status and update it in SQLite. */
async function verifySubscription(): Promise<void> {
  if (!cloudSupabase) return;
  
  const db = getDb();
  let localTenantId: string | null = null;
  
  try {
    const stmt = db.prepare('SELECT tenant_id FROM tenant_config LIMIT 1');
    if (stmt.step()) {
      localTenantId = stmt.getAsObject().tenant_id as string;
    }
    stmt.free();
  } catch (err) {
    return;
  }
  
  if (!localTenantId) return;
  
  try {
    const { data: tenant } = await cloudSupabase
      .from('tenants')
      .select('status')
      .eq('id', localTenantId)
      .maybeSingle();
      
    if (tenant) {
      db.run('UPDATE tenant_config SET status = ?, last_checked_at = datetime("now")', [tenant.status]);
      saveDatabase();
      if (tenant.status !== 'active' && tenant.status !== 'trial') {
        console.warn(`[sync] Tenant subscription is ${tenant.status}. Application locked.`);
      }
    }
  } catch (err: any) {
    console.error('[sync] Failed to verify subscription status:', err.message);
  }
}

/** Pull latest records from Supabase Cloud into local SQLite DB. */
export async function pullFromCloud(tenantId: string): Promise<void> {
  if (!cloudSupabase || !tenantId) return;

  const db = getDb();
  console.log(`[sync] Pulling latest data from cloud for tenant: ${tenantId}...`);

  try {
    // 1. Pull devices
    const { data: devices } = await cloudSupabase
      .from('devices')
      .select('*')
      .eq('tenant_id', tenantId);

    if (devices && devices.length > 0) {
      for (const d of devices) {
        db.run(
          `INSERT OR REPLACE INTO devices (id, name, type, status, specs, hourly_rate, hourly_rate_multi, archived, tenant_id, created_at, updated_at, synced)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [
            d.id,
            d.name,
            d.type || 'pc',
            d.status || 'available',
            d.specs ? (typeof d.specs === 'string' ? d.specs : JSON.stringify(d.specs)) : null,
            Number(d.hourly_rate) || 0,
            Number(d.hourly_rate_multi) || Number(d.hourly_rate) || 0,
            d.archived ? 1 : 0,
            tenantId,
            d.created_at || new Date().toISOString(),
            d.updated_at || new Date().toISOString(),
          ]
        );
      }
    }

    // 2. Pull customers
    const { data: customers } = await cloudSupabase
      .from('customers')
      .select('*')
      .eq('tenant_id', tenantId);

    if (customers && customers.length > 0) {
      for (const c of customers) {
        db.run(
          `INSERT OR REPLACE INTO customers (id, username, name, phone, email, tenant_id, created_at, synced)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
          [c.id, c.username || null, c.name, c.phone || null, c.email || null, tenantId, c.created_at || new Date().toISOString()]
        );
      }
    }

    // 3. Pull products
    const { data: products } = await cloudSupabase
      .from('products')
      .select('*')
      .eq('tenant_id', tenantId);

    if (products && products.length > 0) {
      for (const p of products) {
        db.run(
          `INSERT OR REPLACE INTO products (id, name, price, cost_price, stock, tenant_id, created_at, synced)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
          [p.id, p.name, Number(p.price) || 0, Number(p.cost_price) || null, Number(p.stock) || 0, tenantId, p.created_at || new Date().toISOString()]
        );
      }
    }

    // 4. Pull sessions
    const { data: sessions } = await cloudSupabase
      .from('sessions')
      .select('*')
      .eq('tenant_id', tenantId);

    if (sessions && sessions.length > 0) {
      for (const s of sessions) {
        // Guard: Do not overwrite locally ended sessions back to active
        const localStmt = db.prepare('SELECT status, synced FROM sessions WHERE id = ?');
        localStmt.bind([s.id]);
        let localStatus: string | null = null;
        let localSynced: number | null = null;
        if (localStmt.step()) {
          const row = localStmt.getAsObject();
          localStatus = row.status as string;
          localSynced = row.synced as number;
        }
        localStmt.free();

        if (localStatus === 'ended' && s.status === 'active') {
          continue;
        }
        if (localSynced === 0 && localStatus === 'ended') {
          continue;
        }

        db.run(
          `INSERT OR REPLACE INTO sessions (id, device_id, customer_id, started_at, ended_at, duration_minutes, total_cost, status, session_type, play_mode, scheduled_end, hourly_rate_override, grace_period_minutes, is_overtime, overtime_minutes, edited_start_at, is_paused, total_paused_minutes, created_by, tenant_id, created_at, synced)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [
            s.id,
            s.device_id,
            s.customer_id || null,
            s.started_at,
            s.ended_at || null,
            s.duration_minutes !== null ? Number(s.duration_minutes) : null,
            s.total_cost !== null ? Number(s.total_cost) : null,
            s.status || 'active',
            s.session_type || 'open',
            s.play_mode || 'single',
            s.scheduled_end || null,
            s.hourly_rate_override !== null ? Number(s.hourly_rate_override) : null,
            s.grace_period_minutes || 0,
            s.is_overtime ? 1 : 0,
            s.overtime_minutes || null,
            s.edited_start_at ? 1 : 0,
            s.is_paused ? 1 : 0,
            s.total_paused_minutes || 0,
            s.created_by || null,
            tenantId,
            s.created_at || new Date().toISOString(),
          ]
        );
      }
    }

    // 5. Pull invoices
    const { data: invoices } = await cloudSupabase
      .from('invoices')
      .select('*')
      .eq('tenant_id', tenantId);

    if (invoices && invoices.length > 0) {
      for (const inv of invoices) {
        db.run(
          `INSERT OR REPLACE INTO invoices (id, session_id, amount, paid, payment_method, issued_at, paid_at, tenant_id, synced)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [
            inv.id,
            inv.session_id,
            Number(inv.amount) || 0,
            inv.paid ? 1 : 0,
            inv.payment_method || 'cash',
            inv.issued_at || new Date().toISOString(),
            inv.paid_at || null,
            tenantId,
          ]
        );
      }
    }

    // 6. Pull reservations
    const { data: reservations } = await cloudSupabase
      .from('reservations')
      .select('*')
      .eq('tenant_id', tenantId);

    if (reservations && reservations.length > 0) {
      for (const r of reservations) {
        db.run(
          `INSERT OR REPLACE INTO reservations (id, device_id, customer_id, reserved_from, reserved_until, status, notes, created_by, tenant_id, created_at, synced)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [
            r.id,
            r.device_id,
            r.customer_id || null,
            r.reserved_from,
            r.reserved_until,
            r.status || 'pending',
            r.notes || null,
            r.created_by || null,
            tenantId,
            r.created_at || new Date().toISOString(),
          ]
        );
      }
    }

    // 7. Pull rooms
    const { data: rooms } = await cloudSupabase
      .from('rooms')
      .select('*')
      .eq('tenant_id', tenantId);

    if (rooms && rooms.length > 0) {
      for (const rm of rooms) {
        db.run(
          `INSERT OR REPLACE INTO rooms (id, name, icon, device_id, tenant_id, created_at, updated_at, synced)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
          [
            rm.id,
            rm.name,
            rm.icon || 'sports_esports',
            rm.device_id || null,
            tenantId,
            rm.created_at || new Date().toISOString(),
            rm.updated_at || new Date().toISOString(),
          ]
        );
      }
    }

    saveDatabase();
    console.log(`[sync] Successfully pulled and updated local database from cloud for tenant: ${tenantId}.`);
  } catch (err: any) {
    console.error('[sync] Error pulling from cloud:', err.message);
  }
}

/** Processes outstanding items in the SQLite sync queue. */
export async function runSync(): Promise<void> {
  if (_isSyncing) return;
  if (!cloudSupabase) return;

  const isOnline = await checkOnline();
  if (!isOnline) {
    console.log('[sync] Cloud is offline, skipping sync cycle.');
    return;
  }

  // 1. Check subscription status
  await verifySubscription();

  _isSyncing = true;
  console.log('[sync] Starting sync cycle...');

  const db = getDb();
  try {
    // 2. Determine local tenant ID
    let tenantId: string | null = null;
    try {
      const stmt = db.prepare('SELECT tenant_id FROM tenant_config LIMIT 1');
      if (stmt.step()) {
        tenantId = stmt.getAsObject().tenant_id as string;
      }
      stmt.free();
    } catch (err) {}

    // 3. Push local changes from SQLite up to Cloud FIRST
    const TABLE_RANK: Record<string, number> = {
      tenants: 1,
      users: 2,
      customers: 3,
      devices: 4,
      rooms: 5,
      products: 6,
      sessions: 7,
      session_orders: 8,
      invoices: 9,
      reservations: 10,
      session_audit_log: 11,
      shifts: 12,
      shift_expenses: 13,
    };

    // Get unsynced queue items
    const stmt = db.prepare('SELECT * FROM sync_queue WHERE synced = 0 ORDER BY id ASC LIMIT 100');
    const rawItems: any[] = [];
    while (stmt.step()) {
      rawItems.push(stmt.getAsObject());
    }
    stmt.free();

    if (rawItems.length > 0) {
      // Sort items by dependency rank
      const items = rawItems.sort((a, b) => {
        const rankA = TABLE_RANK[a.table_name] ?? 99;
        const rankB = TABLE_RANK[b.table_name] ?? 99;
        return rankA - rankB;
      });

      console.log(`[sync] Found ${items.length} item(s) to synchronize.`);

      for (const item of items) {
        const { id: queueId, table_name: tableName, record_id: recordId, operation } = item;
        let success = false;
        let errorMsg = '';

        try {
          if (operation === 'DELETE') {
            // Delete from Supabase cloud
            const { error } = await cloudSupabase
              .from(tableName)
              .delete()
              .eq('id', recordId);

            if (error) throw error;
            success = true;
          } else {
            // INSERT or UPDATE: fetch the latest state from SQLite
            const localStmt = db.prepare(`SELECT * FROM "${tableName}" WHERE "id" = ?`);
            localStmt.bind([recordId]);
            
            if (localStmt.step()) {
              const record = localStmt.getAsObject();
              const cleanedRecord = cleanForCloud(tableName, record);
              
              const { error } = await cloudSupabase
                .from(tableName)
                .upsert(cleanedRecord);

              if (error) throw error;
              success = true;

              // Mark local record as synced
              db.run(
                `UPDATE "${tableName}" SET synced = 1, synced_at = datetime('now') WHERE "id" = ?`,
                [recordId]
              );
            } else {
              // Local record deleted/not found. Mark synced.
              success = true; 
            }
            localStmt.free();
          }
        } catch (err: any) {
          errorMsg = err.message || 'Unknown sync error';
          console.error(`[sync] Failed item ${queueId} (${tableName}:${recordId}):`, errorMsg);
        }

        if (success) {
          // Mark sync_queue item as synced
          db.run('UPDATE sync_queue SET synced = 1, error = NULL WHERE id = ?', [queueId]);
          console.log(`[sync] Synced ${operation} for ${tableName}:${recordId}`);
        } else {
          // Log error and increment failure status if FK/schema mismatch so it doesn't loop infinitely
          const isFkOrSchemaError = errorMsg.includes('foreign key') || errorMsg.includes('unique constraint') || errorMsg.includes('duplicate key') || errorMsg.includes('schema cache') || errorMsg.includes('column');
          if (isFkOrSchemaError) {
            db.run('UPDATE sync_queue SET synced = 2, error = ? WHERE id = ?', [`Skipped: ${errorMsg}`, queueId]);
          } else {
            db.run('UPDATE sync_queue SET error = ? WHERE id = ?', [errorMsg, queueId]);
          }
        }
      }
    }

    // 4. Then pull latest changes from Cloud down to SQLite
    if (tenantId) {
      await pullFromCloud(tenantId);
    }

    saveDatabase();
  } catch (err: any) {
    console.error('[sync] Error in sync execution:', err.message);
  } finally {
    _isSyncing = false;
    console.log('[sync] Sync cycle finished.');
  }
}

/** Prepares a SQLite record row for Cloud Supabase compatibility. */
function cleanForCloud(tableName: string, record: Record<string, any>): Record<string, any> {
  const result = { ...record };

  // Remove local-only tracking columns
  delete result.synced;
  delete result.synced_at;
  delete result.password_hash; // Security: do not push local password hashes to cloud

  // List of tables and their column type converters
  const boolCols = ['paid', 'archived', 'is_overtime', 'edited_start_at'];
  const jsonCols = ['specs'];
  const realCols = [
    'hourly_rate',
    'hourly_rate_multi',
    'hourly_rate_override',
    'amount',
    'total_cost',
    'price',
    'cost_price',
    'stock',
    'unit_price',
    'total_price',
    'opening_cash',
    'closing_cash',
    'total_revenue',
    'total_expenses',
  ];

  for (const key of Object.keys(result)) {
    if (boolCols.includes(key)) {
      result[key] = !!result[key];
    }
    if (jsonCols.includes(key) && typeof result[key] === 'string') {
      try {
        result[key] = JSON.parse(result[key]);
      } catch {
        // Keep as string
      }
    }
    if (realCols.includes(key) && result[key] !== null) {
      result[key] = Number(result[key]);
    }
  }

  return result;
}

/** Start the background sync worker. */
export function startSyncEngine(intervalMs = 15000): void {
  if (_syncInterval) return;
  
  // Run immediately on start, then periodically
  setTimeout(() => {
    runSync().catch(err => console.error('[sync] Startup sync failed:', err));
  }, 1000);

  _syncInterval = setInterval(() => {
    runSync().catch(err => console.error('[sync] Sync worker failed:', err));
  }, intervalMs);

  console.log(`[sync] Sync Engine running (interval: ${intervalMs / 1000}s)`);
}

/** Stop the background sync worker. */
export function stopSyncEngine(): void {
  if (_syncInterval) {
    clearInterval(_syncInterval);
    _syncInterval = null;
    console.log('[sync] Sync Engine stopped.');
  }
}
