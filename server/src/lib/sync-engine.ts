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

/** Processes outstanding items in the SQLite sync queue. */
export async function runSync(): Promise<void> {
  if (_isSyncing) return;
  if (!cloudSupabase) return;

  const isOnline = await checkOnline();
  if (!isOnline) {
    console.log('[sync] Cloud is offline, skipping sync cycle.');
    return;
  }

  // Check subscription status
  await verifySubscription();

  _isSyncing = true;
  console.log('[sync] Starting sync cycle...');

  const db = getDb();
  try {
    // Dependency order so parent tables sync before child tables
    const TABLE_RANK: Record<string, number> = {
      tenants: 1,
      users: 2,
      customers: 3,
      devices: 4,
      products: 5,
      sessions: 6,
      session_orders: 7,
      invoices: 8,
      reservations: 9,
      session_audit_log: 10,
    };

    // Get unsynced queue items
    const stmt = db.prepare('SELECT * FROM sync_queue WHERE synced = 0 ORDER BY id ASC LIMIT 100');
    const rawItems: any[] = [];
    while (stmt.step()) {
      rawItems.push(stmt.getAsObject());
    }
    stmt.free();

    if (rawItems.length === 0) {
      _isSyncing = false;
      return;
    }

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
  const realCols = ['hourly_rate', 'hourly_rate_multi', 'hourly_rate_override', 'amount', 'total_cost', 'price', 'unit_price', 'total_price'];

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
export function startSyncEngine(intervalMs = 30000): void {
  if (_syncInterval) return;
  
  // Run immediately on start, then periodically
  setTimeout(() => {
    runSync().catch(err => console.error('[sync] Startup sync failed:', err));
  }, 2000);

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
