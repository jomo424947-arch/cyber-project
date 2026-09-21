import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { Request, Response } from 'express';
import { initDatabase, getDb } from '../lib/database';
import { transferSession } from './sessions.controller';
import { supabase } from '../lib/supabase';

describe('Session Transfer Atomicity & Self-Healing Suite', () => {
  const testTenantId = '031ab84d-c063-4490-8576-a461e7a89de2';
  const testUserId = 'user-admin-test';

  let req: Partial<Request>;
  let res: Partial<Response>;
  let resJsonData: any = null;

  beforeAll(async () => {
    process.env.OFFLINE_MODE = 'true';
    await initDatabase();
  });

  beforeEach(() => {
    const db = getDb();
    db.run('DELETE FROM session_audit_log');
    db.run('DELETE FROM session_transfers');
    db.run('DELETE FROM sessions');
    db.run('DELETE FROM devices');
    db.run('DELETE FROM sync_queue');

    resJsonData = null;
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockImplementation((data) => {
        resJsonData = data;
        return res;
      }),
    };

    req = {
      user: { id: testUserId, email: 'admin@ccms.com', role: 'admin', tenant_id: testTenantId },
      params: {},
      body: {},
    };
  });

  it('successfully transfers session atomically between devices (Device 3 -> Device 1)', async () => {
    const db = getDb();

    // 1. Setup Device 3 (currently in_use) and Device 1 (available)
    db.run(`INSERT INTO devices (id, name, type, status, hourly_rate, hourly_rate_multi, tenant_id)
            VALUES ('dev-3', 'Device 3', 'pc', 'in_use', 20, 30, '${testTenantId}')`);
    db.run(`INSERT INTO devices (id, name, type, status, hourly_rate, hourly_rate_multi, tenant_id)
            VALUES ('dev-1', 'Device 1', 'pc', 'available', 20, 30, '${testTenantId}')`);

    // 2. Setup active session on Device 3
    const sessionId = 'sess-transfer-1';
    db.run(`INSERT INTO sessions (id, device_id, started_at, status, play_mode, session_type, tenant_id)
            VALUES ('${sessionId}', 'dev-3', datetime('now', '-30 minutes'), 'active', 'single', 'open', '${testTenantId}')`);

    req.params = { id: sessionId };
    req.body = { target_device_id: 'dev-1' };

    // 3. Execute transfer
    await transferSession(req as Request, res as Response);

    expect(resJsonData).not.toBeNull();
    expect(resJsonData.data.device_id).toBe('dev-1');
    expect(resJsonData.transfer.from_device_id).toBe('dev-3');
    expect(resJsonData.transfer.to_device_id).toBe('dev-1');

    // Verify DB state
    const dev3Res = db.exec("SELECT status FROM devices WHERE id = 'dev-3'");
    expect(dev3Res[0].values[0][0]).toBe('available');

    const dev1Res = db.exec("SELECT status FROM devices WHERE id = 'dev-1'");
    expect(dev1Res[0].values[0][0]).toBe('in_use');

    const sessRes = db.exec(`SELECT device_id, status FROM sessions WHERE id = '${sessionId}'`);
    expect(sessRes[0].values[0][0]).toBe('dev-1');
    expect(sessRes[0].values[0][1]).toBe('active');

    const trRes = db.exec(`SELECT from_device_id, to_device_id FROM session_transfers WHERE session_id = '${sessionId}'`);
    expect(trRes[0].values.length).toBe(1);
    expect(trRes[0].values[0][0]).toBe('dev-3');
    expect(trRes[0].values[0][1]).toBe('dev-1');
  });

  it('self-heals when target device was stranded in in_use status without an active session', async () => {
    const db = getDb();

    // Device 3 is in_use with active session
    db.run(`INSERT INTO devices (id, name, type, status, hourly_rate, hourly_rate_multi, tenant_id)
            VALUES ('dev-3', 'Device 3', 'pc', 'in_use', 20, 30, '${testTenantId}')`);
    
    // Device 1 was stranded with status = 'in_use' due to previous failure, but has NO active session
    db.run(`INSERT INTO devices (id, name, type, status, hourly_rate, hourly_rate_multi, tenant_id)
            VALUES ('dev-1', 'Device 1', 'pc', 'in_use', 20, 30, '${testTenantId}')`);

    const sessionId = 'sess-transfer-stale';
    db.run(`INSERT INTO sessions (id, device_id, started_at, status, play_mode, session_type, tenant_id)
            VALUES ('${sessionId}', 'dev-3', datetime('now', '-15 minutes'), 'active', 'single', 'open', '${testTenantId}')`);

    req.params = { id: sessionId };
    req.body = { target_device_id: 'dev-1' };

    // Should NOT throw DEVICE_BUSY, should self-heal and succeed
    await transferSession(req as Request, res as Response);

    expect(resJsonData).not.toBeNull();
    expect(resJsonData.data.device_id).toBe('dev-1');

    const dev3Res = db.exec("SELECT status FROM devices WHERE id = 'dev-3'");
    expect(dev3Res[0].values[0][0]).toBe('available');

    const dev1Res = db.exec("SELECT status FROM devices WHERE id = 'dev-1'");
    expect(dev1Res[0].values[0][0]).toBe('in_use');
  });

  it('correctly blocks transfer if target device has a GENUINE active session', async () => {
    const db = getDb();

    db.run(`INSERT INTO devices (id, name, type, status, hourly_rate, hourly_rate_multi, tenant_id)
            VALUES ('dev-3', 'Device 3', 'pc', 'in_use', 20, 30, '${testTenantId}')`);
    db.run(`INSERT INTO devices (id, name, type, status, hourly_rate, hourly_rate_multi, tenant_id)
            VALUES ('dev-1', 'Device 1', 'pc', 'in_use', 20, 30, '${testTenantId}')`);

    // Device 3 session
    db.run(`INSERT INTO sessions (id, device_id, started_at, status, play_mode, session_type, tenant_id)
            VALUES ('sess-3', 'dev-3', datetime('now', '-15 minutes'), 'active', 'single', 'open', '${testTenantId}')`);

    // Device 1 has an actual active session
    db.run(`INSERT INTO sessions (id, device_id, started_at, status, play_mode, session_type, tenant_id)
            VALUES ('sess-1', 'dev-1', datetime('now', '-10 minutes'), 'active', 'single', 'open', '${testTenantId}')`);

    req.params = { id: 'sess-3' };
    req.body = { target_device_id: 'dev-1' };

    await expect(transferSession(req as Request, res as Response)).rejects.toThrow('الجهاز الهدف لديه جلسة نشطة بالفعل');

    // Devices remain unchanged
    const dev3Res = db.exec("SELECT status FROM devices WHERE id = 'dev-3'");
    expect(dev3Res[0].values[0][0]).toBe('in_use');

    const dev1Res = db.exec("SELECT status FROM devices WHERE id = 'dev-1'");
    expect(dev1Res[0].values[0][0]).toBe('in_use');
  });

  it('rolls back completely if an error occurs mid-transaction (leaving DB 100% clean)', async () => {
    const db = getDb();

    db.run(`INSERT INTO devices (id, name, type, status, hourly_rate, hourly_rate_multi, tenant_id)
            VALUES ('dev-3', 'Device 3', 'pc', 'in_use', 20, 30, '${testTenantId}')`);
    db.run(`INSERT INTO devices (id, name, type, status, hourly_rate, hourly_rate_multi, tenant_id)
            VALUES ('dev-1', 'Device 1', 'pc', 'available', 20, 30, '${testTenantId}')`);

    const sessionId = 'sess-rollback-test';
    db.run(`INSERT INTO sessions (id, device_id, started_at, status, play_mode, session_type, tenant_id)
            VALUES ('${sessionId}', 'dev-3', datetime('now', '-20 minutes'), 'active', 'single', 'open', '${testTenantId}')`);

    req.params = { id: sessionId };
    req.body = { target_device_id: 'dev-1' };

    // Spy on session_transfers insert to simulate an unexpected error during transfer
    const originalFrom = supabase.from.bind(supabase);
    const fromSpy = vi.spyOn(supabase, 'from').mockImplementation((...args: any[]) => {
      const table = args[0];
      if (table === 'session_transfers') {
        return {
          insert: () => ({
            select: () => ({
              maybeSingle: async () => {
                throw new Error('Simulated disk/network error during session_transfers');
              },
            }),
          }),
        } as any;
      }
      return originalFrom(table);
    });

    await expect(transferSession(req as Request, res as Response)).rejects.toThrow('Simulated disk/network error');

    fromSpy.mockRestore();

    // Verify atomic rollback:
    // Device 3 should still be in_use (NOT available!)
    const dev3 = db.exec("SELECT status FROM devices WHERE id = 'dev-3'");
    expect(dev3[0].values[0][0]).toBe('in_use');

    // Device 1 should still be available (NOT in_use!)
    const dev1 = db.exec("SELECT status FROM devices WHERE id = 'dev-1'");
    expect(dev1[0].values[0][0]).toBe('available');

    // Session should still point to Device 3
    const sess = db.exec(`SELECT device_id FROM sessions WHERE id = '${sessionId}'`);
    expect(sess[0].values[0][0]).toBe('dev-3');

    // No session_transfers record created
    const tr = db.exec(`SELECT count(*) FROM session_transfers WHERE session_id = '${sessionId}'`);
    expect(tr[0].values[0][0]).toBe(0);
  });
});

