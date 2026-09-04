import { cloudSupabase } from './cloud-supabase';
import { getDb, saveDatabase, getActiveTenantId, updateActiveTenantStatus } from './database';

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
  const localTenantId = getActiveTenantId(db);
  if (!localTenantId) return;

  try {
    const { data: tenant } = await cloudSupabase
      .from('tenants')
      .select('status, plan, expires_at')
      .eq('id', localTenantId)
      .maybeSingle();

    if (tenant) {
      updateActiveTenantStatus(tenant.status, db, tenant.plan, tenant.expires_at);
      if (tenant.status !== 'active' && tenant.status !== 'trial') {
        console.warn(`[sync] Tenant subscription is ${tenant.status}. Application locked.`);
      }
    }
  } catch (err: any) {
    console.error('[sync] Failed to verify subscription status:', err.message);
  }
}

/** Helper: Get last_synced_at timestamp for a specific table and tenant. */
export function getLastSyncedAt(tableName: string, tenantId: string): string | null {
  const db = getDb();
  try {
    const stmt = db.prepare('SELECT last_synced_at FROM sync_state WHERE table_name = ? AND tenant_id = ?');
    stmt.bind([tableName, tenantId]);
    let result: string | null = null;
    if (stmt.step()) {
      result = stmt.getAsObject().last_synced_at as string;
    }
    stmt.free();
    return result;
  } catch {
    return null;
  }
}

/** Helper: Set last_synced_at timestamp for a specific table and tenant. */
export function setLastSyncedAt(tableName: string, tenantId: string, timestamp: string): void {
  const db = getDb();
  try {
    db.run(
      `INSERT INTO sync_state (table_name, tenant_id, last_synced_at)
       VALUES (?, ?, ?)
       ON CONFLICT(table_name, tenant_id) DO UPDATE SET last_synced_at = excluded.last_synced_at`,
      [tableName, tenantId, timestamp]
    );
  } catch (err: any) {
    console.warn(`[sync] Failed to update sync_state for ${tableName}:`, err.message);
  }
}

/** Helper: Check if a local record has unsynced modifications (synced = 0). */
export function isLocalRecordPendingSync(tableName: string, recordId: string): boolean {
  const db = getDb();
  try {
    const stmt = db.prepare(`SELECT synced FROM "${tableName}" WHERE id = ?`);
    stmt.bind([recordId]);
    let isPending = false;
    if (stmt.step()) {
      const obj = stmt.getAsObject();
      isPending = obj.synced === 0;
    }
    stmt.free();
    return isPending;
  } catch {
    return false;
  }
}

/** Pull latest records from Supabase Cloud into local SQLite DB using Parallel Incremental Sync. */
export async function pullFromCloud(tenantId: string): Promise<void> {
  if (!cloudSupabase || !tenantId) return;

  const db = getDb();
  console.log(`[sync] Parallel pull from cloud for tenant: ${tenantId}...`);

  try {
    // Build all queries concurrently
    const lastUsersSynced = getLastSyncedAt('users', tenantId);
    let usersQuery = cloudSupabase
      .from('users')
      .select('id, email, full_name, role, tenant_id, created_at, updated_at')
      .eq('tenant_id', tenantId);
    if (lastUsersSynced) usersQuery = usersQuery.gt('updated_at', lastUsersSynced);

    const lastDevicesSynced = getLastSyncedAt('devices', tenantId);
    let devQuery = cloudSupabase.from('devices').select('*').eq('tenant_id', tenantId);
    if (lastDevicesSynced) devQuery = devQuery.gt('updated_at', lastDevicesSynced);

    const lastCustSynced = getLastSyncedAt('customers', tenantId);
    let custQuery = cloudSupabase.from('customers').select('*').eq('tenant_id', tenantId);
    if (lastCustSynced) custQuery = custQuery.gt('created_at', lastCustSynced);

    // For products, always pull full catalogue for tenant so price/stock updates are instantly synced
    const prodQuery = cloudSupabase.from('products').select('*').eq('tenant_id', tenantId);

    const lastSessSynced = getLastSyncedAt('sessions', tenantId);
    let sessQuery = cloudSupabase.from('sessions').select('*').eq('tenant_id', tenantId);
    if (lastSessSynced) {
      sessQuery = sessQuery.or(`status.eq.active,created_at.gt.${lastSessSynced},ended_at.gt.${lastSessSynced}`);
    }

    const lastInvSynced = getLastSyncedAt('invoices', tenantId);
    let invQuery = cloudSupabase.from('invoices').select('*').eq('tenant_id', tenantId);
    if (lastInvSynced) {
      invQuery = invQuery.or(`issued_at.gt.${lastInvSynced},paid_at.gt.${lastInvSynced}`);
    }

    const lastResSynced = getLastSyncedAt('reservations', tenantId);
    let resQuery = cloudSupabase.from('reservations').select('*').eq('tenant_id', tenantId);
    if (lastResSynced) {
      resQuery = resQuery.or(`status.in.(pending,active),created_at.gt.${lastResSynced}`);
    }

    const lastRoomSynced = getLastSyncedAt('rooms', tenantId);
    let roomQuery = cloudSupabase.from('rooms').select('*').eq('tenant_id', tenantId);
    if (lastRoomSynced) roomQuery = roomQuery.gt('updated_at', lastRoomSynced);

    const lastShiftSynced = getLastSyncedAt('shifts', tenantId);
    let shiftQuery = cloudSupabase.from('shifts').select('*').eq('tenant_id', tenantId);
    if (lastShiftSynced) {
      shiftQuery = shiftQuery.or(`status.eq.active,created_at.gt.${lastShiftSynced},ended_at.gt.${lastShiftSynced}`);
    }

    const lastExpSynced = getLastSyncedAt('shift_expenses', tenantId);
    let expQuery = cloudSupabase.from('shift_expenses').select('*').eq('tenant_id', tenantId);
    if (lastExpSynced) expQuery = expQuery.gt('created_at', lastExpSynced);

    const lastOrderSynced = getLastSyncedAt('session_orders', tenantId);
    let orderQuery = cloudSupabase
      .from('session_orders')
      .select('*, session:sessions!inner(tenant_id)')
      .eq('session.tenant_id', tenantId);
    if (lastOrderSynced) orderQuery = orderQuery.gt('created_at', lastOrderSynced);

    const lastStSynced = getLastSyncedAt('standalone_orders', tenantId);
    let stQuery = cloudSupabase.from('standalone_orders').select('*').eq('tenant_id', tenantId);
    if (lastStSynced) stQuery = stQuery.gt('created_at', lastStSynced);

    const lastTrSynced = getLastSyncedAt('session_transfers', tenantId);
    let trQuery = cloudSupabase.from('session_transfers').select('*').eq('tenant_id', tenantId);
    if (lastTrSynced) trQuery = trQuery.gt('created_at', lastTrSynced);

    const lastPauseSynced = getLastSyncedAt('session_pauses', tenantId);
    let pauseQuery = cloudSupabase.from('session_pauses').select('*').eq('tenant_id', tenantId);
    if (lastPauseSynced) {
      pauseQuery = pauseQuery.or(`paused_at.gt.${lastPauseSynced},resumed_at.gt.${lastPauseSynced}`);
    }

    const lastStockSynced = getLastSyncedAt('product_stock_logs', tenantId);
    let stockQuery = cloudSupabase.from('product_stock_logs').select('*').eq('tenant_id', tenantId);
    if (lastStockSynced) stockQuery = stockQuery.gt('created_at', lastStockSynced);

    // Execute all 15 queries concurrently
    const [
      usersRes,
      devicesRes,
      customersRes,
      productsRes,
      sessionsRes,
      invoicesRes,
      reservationsRes,
      roomsRes,
      shiftsRes,
      shiftExpensesRes,
      sessionOrdersRes,
      standaloneOrdersRes,
      transfersRes,
      pausesRes,
      stockLogsRes,
    ] = await Promise.all([
      usersQuery,
      devQuery,
      custQuery,
      prodQuery,
      sessQuery,
      invQuery,
      resQuery,
      roomQuery,
      shiftQuery,
      expQuery,
      orderQuery,
      stQuery,
      trQuery,
      pauseQuery,
      stockQuery,
    ]);

    // 0. Process users
    const users = usersRes.data;
    if (users && users.length > 0) {
      let maxUpdated = lastUsersSynced || '';
      for (const u of users) {
        if (isLocalRecordPendingSync('users', u.id)) continue;
        db.run(
          `INSERT INTO users (id, email, full_name, role, tenant_id, created_at, updated_at, synced, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))
           ON CONFLICT(id) DO UPDATE SET
             email = excluded.email,
             full_name = excluded.full_name,
             role = excluded.role,
             tenant_id = excluded.tenant_id,
             updated_at = excluded.updated_at,
             synced = 1,
             synced_at = datetime('now')`,
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
        if (u.updated_at && u.updated_at > maxUpdated) maxUpdated = u.updated_at;
      }
      if (maxUpdated) setLastSyncedAt('users', tenantId, maxUpdated);
    }

    // 1. Process devices
    const devices = devicesRes.data;
    if (devices && devices.length > 0) {
      let maxUpdated = lastDevicesSynced || '';
      for (const d of devices) {
        if (isLocalRecordPendingSync('devices', d.id)) continue;
        db.run(
          `INSERT OR REPLACE INTO devices (id, name, type, status, specs, hourly_rate, hourly_rate_multi, archived, tenant_id, created_at, updated_at, synced, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))`,
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
        if (d.updated_at && d.updated_at > maxUpdated) maxUpdated = d.updated_at;
      }
      if (maxUpdated) setLastSyncedAt('devices', tenantId, maxUpdated);
    }

    // 2. Process customers
    const customers = customersRes.data;
    if (customers && customers.length > 0) {
      let maxCreated = lastCustSynced || '';
      for (const c of customers) {
        if (isLocalRecordPendingSync('customers', c.id)) continue;
        db.run(
          `INSERT OR REPLACE INTO customers (id, username, name, phone, email, tenant_id, created_at, synced, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))`,
          [c.id, c.username || null, c.name, c.phone || null, c.email || null, tenantId, c.created_at || new Date().toISOString()]
        );
        if (c.created_at && c.created_at > maxCreated) maxCreated = c.created_at;
      }
      if (maxCreated) setLastSyncedAt('customers', tenantId, maxCreated);
    }

    // 3. Process products
    const products = productsRes.data;
    if (products && products.length > 0) {
      for (const p of products) {
        if (isLocalRecordPendingSync('products', p.id)) continue;
        db.run(
          `INSERT OR REPLACE INTO products (id, name, price, cost_price, stock, tenant_id, created_at, synced, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))`,
          [p.id, p.name, Number(p.price) || 0, Number(p.cost_price) || null, Number(p.stock) || 0, tenantId, p.created_at || new Date().toISOString()]
        );
      }
      setLastSyncedAt('products', tenantId, new Date().toISOString());
    }

    // 4. Process rooms
    const rooms = roomsRes.data;
    if (rooms && rooms.length > 0) {
      let maxUpdated = lastRoomSynced || '';
      for (const rm of rooms) {
        if (isLocalRecordPendingSync('rooms', rm.id)) continue;
        db.run(
          `INSERT OR REPLACE INTO rooms (id, name, icon, device_id, tenant_id, created_at, updated_at, synced, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))`,
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
        if (rm.updated_at && rm.updated_at > maxUpdated) maxUpdated = rm.updated_at;
      }
      if (maxUpdated) setLastSyncedAt('rooms', tenantId, maxUpdated);
    }

    // 5. Process shifts
    const shifts = shiftsRes.data;
    if (shifts && shifts.length > 0) {
      let maxTime = lastShiftSynced || '';
      for (const sh of shifts) {
        if (isLocalRecordPendingSync('shifts', sh.id)) continue;

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

        if (localStatus === 'closed' && sh.status === 'active' && localSynced === 0) {
          continue;
        }

        db.run(
          `INSERT OR REPLACE INTO shifts (id, user_id, tenant_id, started_at, ended_at, opening_cash, closing_cash, total_revenue, total_expenses, notes, status, created_at, synced, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))`,
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
        const candidateTime = sh.ended_at || sh.created_at || sh.started_at;
        if (candidateTime && candidateTime > maxTime) maxTime = candidateTime;
      }
      if (maxTime) setLastSyncedAt('shifts', tenantId, maxTime);
    }

    // 6. Process sessions
    const sessions = sessionsRes.data;
    if (sessions && sessions.length > 0) {
      let maxTime = lastSessSynced || '';
      for (const s of sessions) {
        if (isLocalRecordPendingSync('sessions', s.id)) continue;

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
          `INSERT OR REPLACE INTO sessions (id, device_id, customer_id, started_at, ended_at, duration_minutes, total_cost, status, session_type, play_mode, scheduled_end, hourly_rate_override, grace_period_minutes, is_overtime, overtime_minutes, edited_start_at, is_paused, total_paused_minutes, created_by, tenant_id, created_at, synced, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))`,
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

        if (s.status === 'active' && s.device_id) {
          db.run("UPDATE devices SET status = 'in_use' WHERE id = ? AND status != 'in_use'", [s.device_id]);
        } else if (s.status === 'ended' && s.device_id) {
          db.run("UPDATE devices SET status = 'available' WHERE id = ? AND status = 'in_use'", [s.device_id]);
        }

        const candidateTime = s.ended_at || s.created_at || s.started_at;
        if (candidateTime && candidateTime > maxTime) maxTime = candidateTime;
      }
      if (maxTime) setLastSyncedAt('sessions', tenantId, maxTime);
    }

    // 7. Process invoices
    const invoices = invoicesRes.data;
    if (invoices && invoices.length > 0) {
      let maxTime = lastInvSynced || '';
      for (const inv of invoices) {
        if (isLocalRecordPendingSync('invoices', inv.id)) continue;
        db.run(
          `INSERT OR REPLACE INTO invoices (
            id, session_id, amount, subtotal, discount_amount, discount_type, discount_value,
            service_fee, service_rate, rounding_delta, notes, paid, payment_method, shift_id,
            created_by, issued_at, paid_at, tenant_id, synced, synced_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))`,
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
        const candidateTime = inv.paid_at || inv.issued_at;
        if (candidateTime && candidateTime > maxTime) maxTime = candidateTime;
      }
      if (maxTime) setLastSyncedAt('invoices', tenantId, maxTime);
    }

    // 8. Process reservations
    const reservations = reservationsRes.data;
    if (reservations && reservations.length > 0) {
      let maxCreated = lastResSynced || '';
      for (const r of reservations) {
        if (isLocalRecordPendingSync('reservations', r.id)) continue;
        db.run(
          `INSERT OR REPLACE INTO reservations (id, device_id, customer_id, reserved_from, reserved_until, status, notes, created_by, tenant_id, created_at, synced, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))`,
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
        if (r.created_at && r.created_at > maxCreated) maxCreated = r.created_at;
      }
      if (maxCreated) setLastSyncedAt('reservations', tenantId, maxCreated);
    }

    // 9. Process shift expenses
    const shiftExpenses = shiftExpensesRes.data;
    if (shiftExpenses && shiftExpenses.length > 0) {
      let maxCreated = lastExpSynced || '';
      for (const ex of shiftExpenses) {
        if (isLocalRecordPendingSync('shift_expenses', ex.id)) continue;
        db.run(
          `INSERT OR REPLACE INTO shift_expenses (id, shift_id, tenant_id, amount, category, description, created_by, created_at, synced, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))`,
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
        if (ex.created_at && ex.created_at > maxCreated) maxCreated = ex.created_at;
      }
      if (maxCreated) setLastSyncedAt('shift_expenses', tenantId, maxCreated);
    }

    // 10. Process session orders
    const sessionOrders = sessionOrdersRes.data;
    if (sessionOrders && sessionOrders.length > 0) {
      let maxCreated = lastOrderSynced || '';
      for (const so of sessionOrders) {
        if (isLocalRecordPendingSync('session_orders', so.id)) continue;
        db.run(
          `INSERT OR REPLACE INTO session_orders (id, session_id, product_id, quantity, unit_price, total_price, created_at, synced, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))`,
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
        if (so.created_at && so.created_at > maxCreated) maxCreated = so.created_at;
      }
      if (maxCreated) setLastSyncedAt('session_orders', tenantId, maxCreated);
    }

    // 11. Process standalone orders
    const standaloneOrders = standaloneOrdersRes.data;
    if (standaloneOrders && standaloneOrders.length > 0) {
      let maxCreated = lastStSynced || '';
      for (const st of standaloneOrders) {
        if (isLocalRecordPendingSync('standalone_orders', st.id)) continue;
        db.run(
          `INSERT OR REPLACE INTO standalone_orders (id, tenant_id, product_id, quantity, unit_price, cost_price, total_price, payment_method, shift_id, created_by, created_at, synced, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))`,
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
        if (st.created_at && st.created_at > maxCreated) maxCreated = st.created_at;
      }
      if (maxCreated) setLastSyncedAt('standalone_orders', tenantId, maxCreated);
    }

    // 12. Process transfers
    const transfers = transfersRes.data;
    if (transfers && transfers.length > 0) {
      let maxCreated = lastTrSynced || '';
      for (const tr of transfers) {
        if (isLocalRecordPendingSync('session_transfers', tr.id)) continue;
        db.run(
          `INSERT OR REPLACE INTO session_transfers (id, session_id, from_device_id, to_device_id, started_at, transferred_at, duration_minutes, hourly_rate, play_mode, cost, transferred_by, tenant_id, created_at, synced, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))`,
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
        if (tr.created_at && tr.created_at > maxCreated) maxCreated = tr.created_at;
      }
      if (maxCreated) setLastSyncedAt('session_transfers', tenantId, maxCreated);
    }

    // 13. Process pauses
    const pauses = pausesRes.data;
    if (pauses && pauses.length > 0) {
      let maxTime = lastPauseSynced || '';
      for (const p of pauses) {
        if (isLocalRecordPendingSync('session_pauses', p.id)) continue;
        db.run(
          `INSERT OR REPLACE INTO session_pauses (id, session_id, tenant_id, paused_at, resumed_at, paused_by, resumed_by, reason, synced, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))`,
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
        const candidateTime = p.resumed_at || p.paused_at;
        if (candidateTime && candidateTime > maxTime) maxTime = candidateTime;
      }
      if (maxTime) setLastSyncedAt('session_pauses', tenantId, maxTime);
    }

    // 14. Process stock logs
    const stockLogs = stockLogsRes.data;
    if (stockLogs && stockLogs.length > 0) {
      let maxCreated = lastStockSynced || '';
      for (const sl of stockLogs) {
        if (isLocalRecordPendingSync('product_stock_logs', sl.id)) continue;
        db.run(
          `INSERT OR REPLACE INTO product_stock_logs (id, product_id, tenant_id, actor_id, change_type, delta, balance_after, reason, created_at, synced, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))`,
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
        if (sl.created_at && sl.created_at > maxCreated) maxCreated = sl.created_at;
      }
      if (maxCreated) setLastSyncedAt('product_stock_logs', tenantId, maxCreated);
    }

    saveDatabase();
    console.log(`[sync] Successfully pulled parallel updates from cloud for tenant: ${tenantId}.`);
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
    const tenantId = getActiveTenantId(db);
    if (!tenantId) {
      console.log('[sync] No active tenant configured, skipping sync cycle.');
      return;
    }

    const TENANT_SCOPED_TABLES = new Set([
      'users',
      'devices',
      'customers',
      'sessions',
      'invoices',
      'reservations',
      'products',
      'rooms',
      'shifts',
      'shift_expenses',
      'standalone_orders',
      'session_transfers',
      'session_pauses',
      'product_stock_logs',
    ]);

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
        const { id: queueId, table_name: tableName, record_id: recordId, operation, payload: rawPayload } = item;
        let success = false;
        let errorMsg = '';
        let isQuarantined = false;

        try {
          if (operation === 'DELETE') {
            // Check payload if available for tenant mismatch
            if (rawPayload) {
              try {
                const parsed = JSON.parse(rawPayload);
                if (parsed.tenant_id && parsed.tenant_id !== tenantId) {
                  const mismatchMsg = `[quarantine:tenant_mismatch] payload tenant (${parsed.tenant_id}) !== active tenant (${tenantId})`;
                  console.warn(`[sync] Tenant mismatch on DELETE: record tenant = ${parsed.tenant_id}, active tenant = ${tenantId}, table = ${tableName}, record_id = ${recordId}`);
                  db.run('UPDATE sync_queue SET synced = 2, error = ? WHERE id = ?', [mismatchMsg, queueId]);
                  isQuarantined = true;
                  continue;
                }
              } catch {}
            }

            let deleteQuery = cloudSupabase.from(tableName).delete().eq('id', recordId);
            if (TENANT_SCOPED_TABLES.has(tableName)) {
              deleteQuery = deleteQuery.eq('tenant_id', tenantId);
            }

            const { error } = await deleteQuery;
            if (error) throw error;
            success = true;
          } else {
            const localStmt = db.prepare(`SELECT * FROM "${tableName}" WHERE "id" = ?`);
            localStmt.bind([recordId]);

            if (localStmt.step()) {
              const record = localStmt.getAsObject();
              localStmt.free();

              // Resolve record tenant ID
              let recordTenantId: string | null = null;
              if (record.tenant_id) {
                recordTenantId = record.tenant_id as string;
              } else if (tableName === 'session_orders' || tableName === 'session_audit_log') {
                try {
                  const sessStmt = db.prepare('SELECT tenant_id FROM sessions WHERE id = ?');
                  sessStmt.bind([record.session_id]);
                  if (sessStmt.step()) {
                    recordTenantId = sessStmt.getAsObject().tenant_id as string;
                  }
                  sessStmt.free();
                } catch {}
              }

              // SYNC SAFETY GUARD: Mismatched tenant records must never be pushed to cloud
              if (recordTenantId && recordTenantId !== tenantId) {
                const mismatchMsg = `[quarantine:tenant_mismatch] record tenant (${recordTenantId}) !== active tenant (${tenantId})`;
                console.warn(
                  `[sync] Tenant mismatch: record tenant = ${recordTenantId}, active tenant = ${tenantId}, table = ${tableName}, record_id = ${recordId}`
                );
                db.run('UPDATE sync_queue SET synced = 2, error = ? WHERE id = ?', [mismatchMsg, queueId]);
                isQuarantined = true;
                continue;
              }

              const cleanedRecord = cleanForCloud(tableName, record);
              const { error } = await cloudSupabase
                .from(tableName)
                .upsert(cleanedRecord);

              if (error) throw error;
              success = true;

              db.run(
                `UPDATE "${tableName}" SET synced = 1, synced_at = datetime('now') WHERE "id" = ?`,
                [recordId]
              );
            } else {
              localStmt.free();
              success = true;
            }
          }
        } catch (err: any) {
          errorMsg = err.message || 'Unknown sync error';
          console.error(`[sync] Failed item ${queueId} (${tableName}:${recordId}):`, errorMsg);
        }

        if (isQuarantined) {
          continue;
        }

        if (success) {
          db.run('UPDATE sync_queue SET synced = 1, error = NULL WHERE id = ?', [queueId]);
          console.log(`[sync] Synced ${operation} for ${tableName}:${recordId}`);
        } else {
          // Track retry attempts instead of immediately permanently skipping
          const currentAttempts = (item.error && item.error.match(/\[attempt (\d+)\]/))
            ? parseInt(item.error.match(/\[attempt (\d+)\]/)![1], 10)
            : 0;
          const nextAttempt = currentAttempts + 1;
          
          if (nextAttempt >= 5) {
            db.run('UPDATE sync_queue SET synced = 2, error = ? WHERE id = ?', [`Skipped after ${nextAttempt} attempts: ${errorMsg}`, queueId]);
            console.warn(`[sync] Item ${queueId} (${tableName}:${recordId}) permanently skipped after ${nextAttempt} attempts.`);
          } else {
            db.run('UPDATE sync_queue SET error = ? WHERE id = ?', [`[attempt ${nextAttempt}] ${errorMsg}`, queueId]);
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
export function startSyncEngine(intervalMs = 60000): void {
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
