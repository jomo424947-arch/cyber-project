import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { csrfProtection } from '../middleware/csrf';
import { registerTenant, getTenants } from './auth.controller';
import { createDevice, deleteDevice } from './devices.controller';
import { createEmployee } from './employees.controller';
import { signToken } from '../lib/local-auth';
import { Request, Response } from 'express';

describe('CSRF Protection Middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: Mock;

  beforeEach(() => {
    req = {
      method: 'POST',
      path: '/api/sessions/start',
      headers: {},
      cookies: { 'csrf-token': 'valid-csrf-token-123' },
    };
    res = {
      cookie: vi.fn(),
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    next = vi.fn();
  });

  it('rejects POST requests missing X-CSRF-Token header even if User-Agent is Electron', () => {
    req.headers = { 'user-agent': 'Mozilla/5.0 Electron/31.2.0' };
    csrfProtection(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'CSRF_ERROR',
        }),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('allows POST requests with matching X-CSRF-Token header', () => {
    req.headers = { 'x-csrf-token': 'valid-csrf-token-123' };
    csrfProtection(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  it('allows cross-domain POST requests with X-CSRF-Token header when cookies are omitted', () => {
    req.cookies = {};
    req.headers = { 'x-csrf-token': 'token-from-storage' };
    csrfProtection(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });
});

describe('Super Admin Auth Key Protection (C1)', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;

  beforeEach(() => {
    req = {
      body: { secretKey: 'some-key' },
      headers: { 'x-super-admin-key': 'some-key' },
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
  });

  it('fails closed when SUPER_ADMIN_KEY is not set in environment', async () => {
    delete process.env.SUPER_ADMIN_KEY;
    await expect(registerTenant(req as Request, res as Response)).rejects.toThrow(
      'SUPER_ADMIN_KEY is not configured'
    );
    await expect(getTenants(req as Request, res as Response)).rejects.toThrow(
      'SUPER_ADMIN_KEY is not configured'
    );
  });

  it('rejects wrong secret key when SUPER_ADMIN_KEY is configured', async () => {
    process.env.SUPER_ADMIN_KEY = 'configured-secret-key';
    req.body = { secretKey: 'wrong-key' };
    req.headers = { 'x-super-admin-key': 'wrong-key' };

    await expect(registerTenant(req as Request, res as Response)).rejects.toThrow(
      'Invalid Super Admin Secret Key passcode'
    );
    await expect(getTenants(req as Request, res as Response)).rejects.toThrow(
      'Invalid Super Admin Secret Key passcode'
    );
  });
});

describe('JWT Secret Guard (C3)', () => {
  it('throws in all environments if JWT_SECRET is unset', () => {
    const prevSecret = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;

    expect(() => {
      signToken({ id: '1', email: 'test@example.com', role: 'admin' });
    }).toThrow('FATAL: JWT_SECRET environment variable is not set');

    if (prevSecret) {
      process.env.JWT_SECRET = prevSecret;
    }
  });
});

describe('Device Controller Role Checks (H2)', () => {
  let res: Partial<Response>;

  beforeEach(() => {
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
  });

  it('rejects createDevice for non-admin user', async () => {
    const req = {
      user: { id: 'u1', email: 'staff@cafe.com', role: 'staff', tenant_id: 't1' },
      body: { name: 'PC 1', type: 'pc', hourly_rate: 10 },
    } as unknown as Request;

    await expect(createDevice(req, res as Response)).rejects.toThrow(
      'Only admins can create devices'
    );
  });

  it('rejects deleteDevice for non-admin user', async () => {
    const req = {
      user: { id: 'u1', email: 'staff@cafe.com', role: 'staff', tenant_id: 't1' },
      params: { id: 'dev-1' },
    } as unknown as Request;

    await expect(deleteDevice(req, res as Response)).rejects.toThrow(
      'Only admins can delete devices'
    );
  });
});

describe('Employee Controller Tenant Isolation (H4)', () => {
  let res: Partial<Response>;

  beforeEach(() => {
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
  });

  it('rejects createEmployee when req.user has no tenant_id', async () => {
    const req = {
      user: { id: 'u1', email: 'admin@cafe.com', role: 'admin', tenant_id: null as any },
      body: { email: 'new@cafe.com', password: 'pass', role: 'staff' },
    } as unknown as Request;

    await expect(createEmployee(req, res as Response)).rejects.toThrow(
      'Cannot create employee: your account has no tenant association'
    );
  });
});
