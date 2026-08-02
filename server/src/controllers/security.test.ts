import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { csrfProtection } from '../middleware/csrf';
import { registerTenant, getTenants } from './auth.controller';
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
});

describe('Super Admin Auth Key Protection', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;

  beforeEach(() => {
    req = {
      body: { secretKey: 'CCMS_SECRET_DEV_KEY_2026' },
      headers: { 'x-super-admin-key': 'CCMS_SECRET_DEV_KEY_2026' },
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    delete process.env.SUPER_ADMIN_KEY;
  });

  it('rejects registerTenant when SUPER_ADMIN_KEY is not defined', async () => {
    await expect(registerTenant(req as Request, res as Response)).rejects.toThrow(
      'Invalid Super Admin Secret Key passcode'
    );
  });

  it('rejects getTenants when SUPER_ADMIN_KEY is not defined', async () => {
    await expect(getTenants(req as Request, res as Response)).rejects.toThrow(
      'Invalid Super Admin Secret Key passcode'
    );
  });
});
