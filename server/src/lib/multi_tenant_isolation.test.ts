import { describe, it, expect, beforeEach } from 'vitest';
import {
  initDatabase,
  getDb,
  getActiveTenantConfig,
  getActiveTenantId,
  setActiveTenantConfig,
  updateActiveTenantStatus,
} from './database';
import { localDb } from './local-db';
import { runSync } from './sync-engine';
import { signToken, verifyToken } from './local-auth';

describe('Multi-Tenant Local Isolation & Sync Safety Suite', () => {
  beforeEach(async () => {
    process.env.JWT_SECRET = 'test-secret-key-12345678901234567890';
    await initDatabase();
    const db = getDb();
    // Clear all test tables
    db.run('DELETE FROM sync_queue');
    db.run('DELETE FROM devices');
    db.run('DELETE FROM customers');
    db.run('DELETE FROM sessions');
    db.run('DELETE FROM session_orders');
    db.run('DELETE FROM products');
    db.run('DELETE FROM users');
    db.run('DELETE FROM tenant_config');
  });

  describe('1. Single Tenant Configuration & Lifecycle Invariants', () => {
    it('enforces that setting a tenant config leaves exactly 1 row', () => {
      const db = getDb();
      setActiveTenantConfig({
        tenant_id: 'tenant-aaa-111',
        tenant_name: 'Café Alpha',
        owner_email: 'alpha@cafe.com',
        status: 'active',
      });

      const config = getActiveTenantConfig();
      expect(config).not.toBeNull();
      expect(config?.tenant_id).toBe('tenant-aaa-111');
      expect(config?.tenant_name).toBe('Café Alpha');
      expect(getActiveTenantId()).toBe('tenant-aaa-111');

      const countRes = db.exec('SELECT COUNT(*) FROM tenant_config');
      expect(countRes[0].values[0][0]).toBe(1);
    });

    it('repeated login / configuration for same tenant does NOT accumulate rows', () => {
      const db = getDb();

      for (let i = 0; i < 5; i++) {
        setActiveTenantConfig({
          tenant_id: 'tenant-aaa-111',
          tenant_name: 'Café Alpha',
          owner_email: 'alpha@cafe.com',
          status: 'active',
        });
      }

      const countRes = db.exec('SELECT COUNT(*) FROM tenant_config');
      expect(countRes[0].values[0][0]).toBe(1);
      expect(getActiveTenantId()).toBe('tenant-aaa-111');
    });

    it('switching tenant replaces previous tenant cleanly with no lingering state', () => {
      const db = getDb();

      // First tenant
      setActiveTenantConfig({
        tenant_id: 'tenant-aaa-111',
        tenant_name: 'Café Alpha',
        owner_email: 'alpha@cafe.com',
        status: 'active',
      });

      // Switch to Second tenant
      setActiveTenantConfig({
        tenant_id: 'tenant-bbb-222',
        tenant_name: 'Café Beta',
        owner_email: 'beta@cafe.com',
        status: 'active',
      });

      const countRes = db.exec('SELECT COUNT(*) FROM tenant_config');
      expect(countRes[0].values[0][0]).toBe(1);
      expect(getActiveTenantId()).toBe('tenant-bbb-222');
      expect(getActiveTenantConfig()?.tenant_name).toBe('Café Beta');
    });

    it('updateActiveTenantStatus updates status and last_checked_at on active tenant', () => {
      setActiveTenantConfig({
        tenant_id: 'tenant-aaa-111',
        tenant_name: 'Café Alpha',
        owner_email: 'alpha@cafe.com',
        status: 'active',
      });

      updateActiveTenantStatus('suspended');

      const config = getActiveTenantConfig();
      expect(config?.status).toBe('suspended');
      expect(config?.last_checked_at).toBeTruthy();
    });
  });

  describe('2. Legacy Multi-Row Startup Resolution & Sanitization', () => {
    it('resolves authoritative tenant from local admin user when multiple rows exist', () => {
      const db = getDb();

      // Insert multiple polluted rows manually as happened in legacy versions
      db.run(
        `INSERT INTO tenant_config (tenant_id, tenant_name, owner_email, status, activated_at, last_checked_at)
         VALUES ('tenant-old-111', 'Old Café', 'old@cafe.com', 'active', '2026-01-01', '2026-01-01'),
                ('tenant-current-222', 'Active Café', 'admin@active.com', 'active', '2026-02-01', '2026-02-01'),
                ('tenant-other-333', 'Other Café', 'other@cafe.com', 'active', '2026-01-15', '2026-01-15')`
      );

      // Local admin user exists with tenant-current-222
      db.run(
        `INSERT INTO users (id, email, full_name, role, tenant_id)
         VALUES ('user-admin-1', 'admin@active.com', 'Admin User', 'admin', 'tenant-current-222')`
      );

      const resolvedConfig = getActiveTenantConfig();
      expect(resolvedConfig).not.toBeNull();
      expect(resolvedConfig?.tenant_id).toBe('tenant-current-222');
      expect(resolvedConfig?.tenant_name).toBe('Active Café');
    });
  });

  describe('3. Local DB Tenant Injection', () => {
    it('automatically injects the active tenant_id on INSERT when missing', async () => {
      setActiveTenantConfig({
        tenant_id: 'tenant-active-777',
        tenant_name: 'Local Cyber',
        owner_email: 'owner@cyber.com',
        status: 'active',
      });

      const { data: device, error } = await localDb.from('devices').insert({
        name: 'PC-10',
        type: 'pc',
        hourly_rate: 15,
      });

      expect(error).toBeNull();
      expect(device).not.toBeNull();
      expect(device.tenant_id).toBe('tenant-active-777');
    });

    it('preserves explicitly provided tenant_id on INSERT', async () => {
      setActiveTenantConfig({
        tenant_id: 'tenant-active-777',
        tenant_name: 'Local Cyber',
        owner_email: 'owner@cyber.com',
        status: 'active',
      });

      const { data: customer, error } = await localDb.from('customers').insert({
        name: 'Ahmed',
        tenant_id: 'tenant-custom-999',
      });

      expect(error).toBeNull();
      expect(customer).not.toBeNull();
      expect(customer.tenant_id).toBe('tenant-custom-999');
    });
  });

  describe('4. Sync Engine Safety Guard & Quarantine', () => {
    it('quarantines mismatched tenant records and skips cloud push', async () => {
      const db = getDb();
      const currentTenant = 'tenant-active-current';
      const foreignTenant = 'tenant-foreign-evil';

      setActiveTenantConfig({
        tenant_id: currentTenant,
        tenant_name: 'Active Café',
        owner_email: 'active@cafe.com',
        status: 'active',
      });

      // Insert a device belonging to the foreign tenant
      db.run(
        `INSERT INTO devices (id, name, type, status, hourly_rate, tenant_id)
         VALUES ('dev-foreign-1', 'Foreign PC', 'pc', 'available', 20, '${foreignTenant}')`
      );

      // Enqueue sync item for foreign device
      db.run(
        `INSERT INTO sync_queue (table_name, record_id, operation, payload, synced)
         VALUES ('devices', 'dev-foreign-1', 'INSERT', NULL, 0)`
      );

      // Insert a device belonging to current tenant
      db.run(
        `INSERT INTO devices (id, name, type, status, hourly_rate, tenant_id)
         VALUES ('dev-current-1', 'Current PC', 'pc', 'available', 20, '${currentTenant}')`
      );

      // Enqueue sync item for current device
      db.run(
        `INSERT INTO sync_queue (table_name, record_id, operation, payload, synced)
         VALUES ('devices', 'dev-current-1', 'INSERT', NULL, 0)`
      );

      // Execute sync cycle
      await runSync();

      // Check sync_queue status
      const foreignItemRes = db.exec("SELECT synced, error FROM sync_queue WHERE record_id = 'dev-foreign-1'");
      expect(foreignItemRes[0].values[0][0]).toBe(2); // Quarantined / permanently skipped
      expect(foreignItemRes[0].values[0][1]).toContain('[quarantine:tenant_mismatch]');

      const currentItemRes = db.exec("SELECT synced, error FROM sync_queue WHERE record_id = 'dev-current-1'");
      // If cloud is offline during test, it remains synced=0 or retried; but must NOT be quarantined with tenant mismatch
      const currentStatus = currentItemRes[0].values[0][0];
      const currentError = (currentItemRes[0].values[0][1] as string) || '';
      expect(currentError).not.toContain('quarantine:tenant_mismatch');
    });

    it('quarantines session_orders if parent session belongs to another tenant', async () => {
      const db = getDb();
      const currentTenant = 'tenant-active-current';
      const foreignTenant = 'tenant-foreign-evil';

      setActiveTenantConfig({
        tenant_id: currentTenant,
        tenant_name: 'Active Café',
        owner_email: 'active@cafe.com',
        status: 'active',
      });

      // Insert a session belonging to foreign tenant
      db.run(
        `INSERT INTO devices (id, name, type, status, hourly_rate, tenant_id)
         VALUES ('dev-for-sess', 'Foreign PC', 'pc', 'available', 20, '${foreignTenant}')`
      );
      db.run(
        `INSERT INTO sessions (id, device_id, status, tenant_id)
         VALUES ('sess-foreign-1', 'dev-for-sess', 'active', '${foreignTenant}')`
      );

      // Insert session order under that session
      db.run(
        `INSERT INTO products (id, name, price, tenant_id)
         VALUES ('prod-1', 'Cola', 10, '${foreignTenant}')`
      );
      db.run(
        `INSERT INTO session_orders (id, session_id, product_id, quantity, unit_price, total_price)
         VALUES ('order-foreign-1', 'sess-foreign-1', 'prod-1', 2, 10, 20)`
      );

      // Enqueue sync item for session order
      db.run(
        `INSERT INTO sync_queue (table_name, record_id, operation, payload, synced)
         VALUES ('session_orders', 'order-foreign-1', 'INSERT', NULL, 0)`
      );

      // Run sync
      await runSync();

      const orderItemRes = db.exec("SELECT synced, error FROM sync_queue WHERE record_id = 'order-foreign-1'");
      expect(orderItemRes[0].values[0][0]).toBe(2); // Quarantined
      expect(orderItemRes[0].values[0][1]).toContain('[quarantine:tenant_mismatch]');
    });
  });

  describe('5. JWT & Local Auth Tenant Association', () => {
    it('signs and verifies JWT with embedded tenant_id', () => {
      const payload = {
        id: 'user-123',
        email: 'user@cafe.com',
        role: 'admin',
        tenant_id: 'tenant-xyz-999',
      };

      const token = signToken(payload);
      expect(typeof token).toBe('string');

      const decoded = verifyToken(token);
      expect(decoded.id).toBe('user-123');
      expect(decoded.tenant_id).toBe('tenant-xyz-999');
      expect(decoded.role).toBe('admin');
    });
  });
});
