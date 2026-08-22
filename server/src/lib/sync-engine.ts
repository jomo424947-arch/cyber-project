import { cloudSupabase } from './cloud-supabase';
import { getDb, saveDatabase } from './database';

let _syncInterval: ReturnType<typeof setInterval> | null = null;
let _isSyncing = false;
let _immediateSyncTimer: ReturnType<typeof setTimeout> | null = null;

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
    // 0. Pull users / employees
    try {
      const { data: users } = await cloudSupabase
        .from('users')
        .select('id, email, full_name, role, tenant_id, created_at, updated_at')
        .eq('tenant_id', tenantId);

      if (users && users.length > 0) {
        for (const u of users) {
          db.run(
            `INSERT INTO users (id, email, full_name, role, tenant_id, created_at, updated_at, synced)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1)
             ON CONFLICT(id) DO UPDATE SET
               email = excluded.email,
               full_name = excluded.full_name,
               role = excluded.role,
               tenant_id = excluded.tenant_id,
               updated_at = excluded.updated_at,
               synced = 1`,
            [
              u.id,
              u.email,
              u.full_name || null,
              u.role || 'staff',
              tenantId,
              u.created_at || new Date().toISOString(),
              u.updated_at || new Date().toISOString(),
            ]
          );
        }
      }
    } catch (uErr: any) {
      console.warn('[sync] Non-critical error pulling users:', uErr.message);
    }

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

        // Update local device status to match active/ended session state
        if (s.status === 'active' && s.device_id) {
          db.run("UPDATE devices SET status = 'in_use' WHERE id = ? AND status != 'in_use'", [s.device_id]);
        }
      }
    }

    // 5. Pull invoices (with shift_id, created_by, and pricing adjustments)
    const { data: invoices } = await cloudSupabase
      .from('invoices')
      .select('*')
      .eq('tenant_id', tenantId);

    if (invoices && invoices.length > 0) {
      for (const inv of invoices) {
        db.run(
          `INSERT OR REPLACE INTO invoices (
            id, session_id, amount, subtotal, discount_amount, discount_type, discount_value,
            service_fee, service_rate, rounding_delta, notes, paid, payment_method, shift_id,
            created_by, issued_at, paid_at, tenant_id, synced
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [
            inv.id,
            inv.session_id,
            Number(inv.amount) || 0,
            Number(inv.subtotal) || 0,
            Number(inv.discount_amount) || 0,
            inv.discount_type || 'none',
            Number(inv.discount_value) || 0,
            Number(inv.service_fee) || 0,
            Number(inv.service_rate) || 0,
            Number(inv.rounding_delta) || 0,
            inv.notes || null,
            inv.paid ? 1 : 0,
            inv.payment_method || 'cash',
            inv.shift_id || null,
            inv.created_by || null,
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

    // 8. Pull shifts (sync active and closed shifts)
    const { data: shifts } = await cloudSupabase
      .from('shifts')
      .select('*')
      .eq('tenant_id', tenantId);

    if (shifts && shifts.length > 0) {
      for (const sh of shifts) {
        // Guard: check if local shift has unsynced changes
        const localStmt = db.prepare('SELECT status, synced FROM shifts WHERE id = ?');
        localStmt.bind([sh.id]);
        let localStatus: string | null = null;
        let localSynced: number | null = null;
        if (localStmt.step()) {
          const row = localStmt.getAsObject();
          localStatus = row.status as string;
          localSynced = row.synced as number;
        }
        localStmt.free();

        // If local is closed but cloud is active, and local is pending sync, don't revert
        if (localStatus === 'closed' && sh.status === 'active' && localSynced === 0) {
          continue;
        }

        db.run(
          `INSERT OR REPLACE INTO shifts (id, user_id, tenant_id, started_at, ended_at, opening_cash, closing_cash, total_revenue, total_expenses, notes, status, created_at, synced)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [
            sh.id,
            sh.user_id,
            tenantId,
            sh.started_at || new Date().toISOString(),
            sh.ended_at || null,
            Number(sh.opening_cash) || 0,
            sh.closing_cash !== null && sh.closing_cash !== undefined ? Number(sh.closing_cash) : null,
            Number(sh.total_revenue) || 0,
            Number(sh.total_expenses) || 0,
            sh.notes || null,
            sh.status || 'active',
            sh.created_at || new Date().toISOString(),
          ]
        );
      }
    }

    // 9. Pull shift expenses
    const { data: shiftExpenses } = await cloudSupabase
      .from('shift_expenses')
      .select('*')
      .eq('tenant_id', tenantId);

    if (shiftExpenses && shiftExpenses.length > 0) {
      for (const ex of shiftExpenses) {
        db.run(
          `INSERT OR REPLACE INTO shift_expenses (id, shift_id, tenant_id, amount, category, description, created_by, created_at, synced)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [
            ex.id,
            ex.shift_id,
            tenantId,
            Number(ex.amount) || 0,
            ex.category || '',
            ex.description || '',
            ex.created_by || null,
            ex.created_at || new Date().toISOString(),
          ]
        );
      }
    }

    // 10. Pull session orders (café orders tied to gaming sessions)
    const { data: sessionOrders } = await cloudSupabase
      .from('session_orders')
      .select('*');

    if (sessionOrders && sessionOrders.length > 0) {
      for (const so of sessionOrders) {
        db.run(
          `INSERT OR REPLACE INTO session_orders (id, session_id, product_id, quantity, unit_price, total_price, created_at, synced)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
          [
            so.id,
            so.session_id,
            so.product_id,
            Number(so.quantity) || 1,
            Number(so.unit_price) || 0,
            Number(so.total_price) || 0,
            so.created_at || new Date().toISOString(),
          ]
        );
      }
    }

    // 11. Pull standalone orders (walk-in café sales)
    const { data: standaloneOrders } = await cloudSupabase
      .from('standalone_orders')
      .select('*')
      .eq('tenant_id', tenantId);

    if (standaloneOrders && standaloneOrders.length > 0) {
      for (const st of standaloneOrders) {
        db.run(
          `INSERT OR REPLACE INTO standalone_orders (id, tenant_id, product_id, quantity, unit_price, cost_price, total_price, payment_method, shift_id, created_by, created_at, synced)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [
            st.id,
            tenantId,
            st.product_id,
            Number(st.quantity) || 1,
            Number(st.unit_price) || 0,
            st.cost_price !== null && st.cost_price !== undefined ? Number(st.cost_price) : null,
            Number(st.total_price) || 0,
            st.payment_method || 'cash',
            st.shift_id || null,
            st.created_by || null,
            st.created_at || new Date().toISOString(),
          ]
        );
      }
    }

    // 12. Pull session transfers
    const { data: transfers } = await cloudSupabase
      .from('session_transfers')
      .select('*')
      .eq('tenant_id', tenantId);

    if (transfers && transfers.length > 0) {
      for (const tr of transfers) {
        db.run(
          `INSERT OR REPLACE INTO session_transfers (id, session_id, from_device_id, to_device_id, started_at, transferred_at, duration_minutes, hourly_rate, play_mode, cost, transferred_by, tenant_id, created_at, synced)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [
            tr.id,
            tr.session_id,
            tr.from_device_id,
            tr.to_device_id,
            tr.started_at,
            tr.transferred_at || new Date().toISOString(),
            Number(tr.duration_minutes) || 0,
            Number(tr.hourly_rate) || 0,
            tr.play_mode || 'single',
            Number(tr.cost) || 0,
            tr.transferred_by || null,
            tenantId,
            tr.created_at || new Date().toISOString(),
          ]
        );
      }
    }

    // 13. Pull session pauses
    const { data: pauses } = await cloudSupabase
      .from('session_pauses')
      .select('*')
      .eq('tenant_id', tenantId);

    if (pauses && pauses.length > 0) {
      for (const p of pauses) {
        db.run(
          `INSERT OR REPLACE INTO session_pauses (id, session_id, tenant_id, paused_at, resumed_at, paused_by, resumed_by, reason, synced)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [
            p.id,
            p.session_id,
            tenantId,
            p.paused_at,
            p.resumed_at || null,
            p.paused_by || null,
            p.resumed_by || null,
            p.reason || null,
          ]
        );
      }
    }

    // 14. Pull stock logs
    const { data: stockLogs } = await cloudSupabase
      .from('product_stock_logs')
      .select('*')
      .eq('tenant_id', tenantId);

    if (stockLogs && stockLogs.length > 0) {
      for (const sl of stockLogs) {
        db.run(
          `INSERT OR REPLACE INTO product_stock_logs (id, product_id, tenant_id, actor_id, change_type, delta, balance_after, reason, created_at, synced)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [
            sl.id,
            sl.product_id,
            tenantId,
            sl.actor_id || null,
            sl.change_type || 'manual_adjustment',
            Number(sl.delta) || 0,
            Number(sl.balance_after) || 0,
            sl.reason || null,
            sl.created_at || new Date().toISOString(),
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
      shifts: 7,
      sessions: 8,
      session_orders: 9,
      session_transfers: 10,
      session_pauses: 11,
      invoices: 12,
      standalone_orders: 13,
      shift_expenses: 14,
      product_stock_logs: 15,
      reservations: 16,
      session_audit_log: 17,
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
  const boolCols = ['paid', 'archived', 'is_overtime', 'edited_start_at', 'is_paused'];
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
    'cost',
    'subtotal',
    'discount_amount',
    'discount_value',
    'service_fee',
    'service_rate',
    'rounding_delta',
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

/**
 * Trigger an immediate sync cycle after a critical operation
 * (e.g. start/close shift, start/end session).
 * Debounces rapid calls — waits 2 seconds after the last call before syncing.
 */
export function triggerImmediateSync(): void {
  if (_immediateSyncTimer) {
    clearTimeout(_immediateSyncTimer);
  }
  _immediateSyncTimer = setTimeout(() => {
    _immediateSyncTimer = null;
    console.log('[sync] Immediate sync triggered after critical operation...');
    runSync().catch(err => console.error('[sync] Immediate sync failed:', err));
  }, 2000);
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
  if (_immediateSyncTimer) {
    clearTimeout(_immediateSyncTimer);
    _immediateSyncTimer = null;
  }
}
