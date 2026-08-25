import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { initDatabase, getDb } from './database';
import { 
  localDb, 
  incrementShiftRevenueAtomic, 
  incrementShiftExpensesAtomic, 
  adjustProductStockAtomic, 
  decrementProductStockAtomic,
  getSyncQueueHealth,
  resetSyncQueueHealth
} from './local-db';

describe('Data Integrity & Concurrency Operations', () => {
  const testTenantId = 'tenant-test-123';
  const testUserId = 'user-test-123';

  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(() => {
    resetSyncQueueHealth();
    const db = getDb();
    db.run(`DELETE FROM sync_queue;`);
    db.run(`DELETE FROM shift_expenses;`);
    db.run(`DELETE FROM shifts;`);
    db.run(`DELETE FROM products;`);
    db.run(`DELETE FROM devices;`);
  });

  describe('1. Atomic Shift Financial Metrics (No Race Conditions)', () => {
    it('atomically increments shift total_revenue under concurrent updates', async () => {
      const db = getDb();
      const shiftId = 'shift-atomic-rev-1';

      // Insert base shift with 0 total_revenue
      db.run(
        `INSERT INTO shifts (id, user_id, tenant_id, started_at, opening_cash, total_revenue, total_expenses, status)
         VALUES (?, ?, ?, datetime('now'), 100, 0, 0, 'active')`,
        [shiftId, testUserId, testTenantId]
      );

      // Simulate 10 concurrent session completions each contributing 25.50
      const increments = Array.from({ length: 10 }, () => 25.50);
      await Promise.all(
        increments.map(amount =>
          localDb.rpc('increment_shift_revenue', {
            p_shift_id: shiftId,
            p_tenant_id: testTenantId,
            p_amount: amount,
          })
        )
      );

      const res = db.exec(`SELECT total_revenue FROM shifts WHERE id = '${shiftId}'`);
      const finalRev = Number(res[0]?.values[0]?.[0] || 0);

      // 10 * 25.50 = 255.00 exact without losing any update
      expect(finalRev).toBe(255.00);
    });

    it('atomically increments shift total_expenses under concurrent additions', async () => {
      const db = getDb();
      const shiftId = 'shift-atomic-exp-1';

      // Insert base shift
      db.run(
        `INSERT INTO shifts (id, user_id, tenant_id, started_at, opening_cash, total_revenue, total_expenses, status)
         VALUES (?, ?, ?, datetime('now'), 100, 0, 0, 'active')`,
        [shiftId, testUserId, testTenantId]
      );

      // Simulate 5 concurrent expense additions of 15.25
      const increments = Array.from({ length: 5 }, () => 15.25);
      await Promise.all(
        increments.map(amount =>
          localDb.rpc('increment_shift_expenses', {
            p_shift_id: shiftId,
            p_tenant_id: testTenantId,
            p_amount: amount,
          })
        )
      );

      const res = db.exec(`SELECT total_expenses FROM shifts WHERE id = '${shiftId}'`);
      const finalExpenses = Number(res[0]?.values[0]?.[0] || 0);

      // 5 * 15.25 = 76.25 exact
      expect(finalExpenses).toBe(76.25);
    });

    it('guards against negative total_revenue / total_expenses below zero', () => {
      const shiftId = 'shift-guard-neg';
      const db = getDb();
      db.run(
        `INSERT INTO shifts (id, user_id, tenant_id, started_at, opening_cash, total_revenue, total_expenses, status)
         VALUES (?, ?, ?, datetime('now'), 100, 10, 5, 'active')`,
        [shiftId, testUserId, testTenantId]
      );

      // Decrement more than current balance
      incrementShiftRevenueAtomic(shiftId, testTenantId, -50);
      incrementShiftExpensesAtomic(shiftId, testTenantId, -50);

      const res = db.exec(`SELECT total_revenue, total_expenses FROM shifts WHERE id = '${shiftId}'`);
      const rev = Number(res[0]?.values[0]?.[0] || 0);
      const exp = Number(res[0]?.values[0]?.[1] || 0);

      expect(rev).toBe(0);
      expect(exp).toBe(0);
    });
  });

  describe('2. Comprehensive sync_queue Recording on Bulk & Non-ID WHERE Updates/Deletes', () => {
    it('captures ALL affected records in sync_queue when UPDATE uses a non-id WHERE clause (e.g. status filter)', async () => {
      const db = getDb();
      // Insert 3 devices with status 'available'
      db.run(`INSERT INTO devices (id, name, type, status, tenant_id) VALUES ('dev-1', 'PC 1', 'pc', 'available', '${testTenantId}')`);
      db.run(`INSERT INTO devices (id, name, type, status, tenant_id) VALUES ('dev-2', 'PC 2', 'pc', 'available', '${testTenantId}')`);
      db.run(`INSERT INTO devices (id, name, type, status, tenant_id) VALUES ('dev-3', 'PC 3', 'pc', 'in_use', '${testTenantId}')`);

      db.run(`DELETE FROM sync_queue`);

      // Update with WHERE status = 'available' (no col === 'id')
      const { error } = await localDb
        .from('devices')
        .update({ status: 'offline' })
        .eq('status', 'available')
        .eq('tenant_id', testTenantId);

      expect(error).toBeNull();

      // Check sync_queue — both dev-1 and dev-2 MUST be queued!
      const qRes = db.exec(`SELECT record_id, operation FROM sync_queue WHERE table_name = 'devices'`);
      const rows = qRes[0]?.values || [];
      const queuedIds = rows.map((r: any[]) => r[0]);

      expect(queuedIds).toContain('dev-1');
      expect(queuedIds).toContain('dev-2');
      expect(queuedIds).not.toContain('dev-3');
      expect(queuedIds.length).toBe(2);
    });

    it('captures ALL affected records in sync_queue when DELETE uses a non-id WHERE clause', async () => {
      const db = getDb();
      db.run(`INSERT INTO devices (id, name, type, status, tenant_id) VALUES ('del-1', 'PC 1', 'pc', 'offline', '${testTenantId}')`);
      db.run(`INSERT INTO devices (id, name, type, status, tenant_id) VALUES ('del-2', 'PC 2', 'pc', 'offline', '${testTenantId}')`);
      db.run(`INSERT INTO devices (id, name, type, status, tenant_id) VALUES ('del-3', 'PC 3', 'pc', 'available', '${testTenantId}')`);

      db.run(`DELETE FROM sync_queue`);

      const { error } = await localDb
        .from('devices')
        .delete()
        .eq('status', 'offline')
        .eq('tenant_id', testTenantId);

      expect(error).toBeNull();

      const qRes = db.exec(`SELECT record_id, operation FROM sync_queue WHERE table_name = 'devices'`);
      const rows = qRes[0]?.values || [];
      const queuedIds = rows.map((r: any[]) => r[0]);

      expect(queuedIds).toContain('del-1');
      expect(queuedIds).toContain('del-2');
      expect(queuedIds).not.toContain('del-3');
      expect(queuedIds.length).toBe(2);
    });
  });

  describe('3. Sync Queue Health Monitoring & Error Handling', () => {
    it('initial health state is healthy', () => {
      const health = getSyncQueueHealth();
      expect(health.hasUnrecordedSync).toBe(false);
      expect(health.unrecordedCount).toBe(0);
      expect(health.lastError).toBeNull();
    });

    it('resets sync queue health state properly', () => {
      resetSyncQueueHealth();
      const health = getSyncQueueHealth();
      expect(health.hasUnrecordedSync).toBe(false);
      expect(health.unrecordedCount).toBe(0);
    });
  });

  describe('4. Atomic Stock Adjustment on Void / Restock', () => {
    it('atomically restores stock on order void without race conditions', () => {
      const db = getDb();
      const productId = 'prod-stock-test-1';
      db.run(`INSERT INTO products (id, name, price, stock, tenant_id) VALUES (?, 'Snack', 15, 10, ?)`, [productId, testTenantId]);

      // Decrement 3 (sale)
      const afterSale = decrementProductStockAtomic(productId, testTenantId, 3);
      expect(afterSale?.stock).toBe(7);

      // Restore 3 (void order)
      const afterVoid = adjustProductStockAtomic(productId, testTenantId, 3);
      expect(afterVoid?.stock).toBe(10);
    });

    it('rejects decrement if stock is insufficient', () => {
      const db = getDb();
      const productId = 'prod-stock-test-2';
      db.run(`INSERT INTO products (id, name, price, stock, tenant_id) VALUES (?, 'Drink', 20, 2, ?)`, [productId, testTenantId]);

      const result = decrementProductStockAtomic(productId, testTenantId, 5);
      expect(result).toBeNull();

      const res = db.exec(`SELECT stock FROM products WHERE id = '${productId}'`);
      expect(res[0]?.values[0]?.[0]).toBe(2);
    });
  });
});
