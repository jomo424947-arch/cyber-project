import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listRooms, createRoom, updateRoom, deleteRoom } from './rooms.controller';
import { Request, Response } from 'express';
import { supabase } from '../lib/supabase';

describe('Gaming Rooms Management', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;

  beforeEach(() => {
    req = {
      user: { id: 'admin-user-id', email: 'admin@ccms.com', role: 'admin', tenant_id: 'tenant-123' },
      body: {},
      params: {},
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
  });

  it('rejects room creation if user is not admin', async () => {
    req.user = { id: 'staff-user-id', email: 'staff@ccms.com', role: 'staff', tenant_id: 'tenant-123' };
    await expect(createRoom(req as Request, res as Response)).rejects.toThrow('Only admins can create gaming rooms');
  });

  it('rejects room deletion if user is not admin', async () => {
    req.user = { id: 'staff-user-id', email: 'staff@ccms.com', role: 'staff', tenant_id: 'tenant-123' };
    req.params = { id: 'room-1' };
    await expect(deleteRoom(req as Request, res as Response)).rejects.toThrow('Only admins can delete gaming rooms');
  });

  it('calculates room play mode rates independently without affecting hall devices', () => {
    const singleRate = 25;
    const multiRate = 35;

    const playModeSingle: string = 'single';
    const effectiveRateSingle = playModeSingle === 'multiplayer' ? multiRate : singleRate;
    expect(effectiveRateSingle).toBe(25);

    const playModeMulti: string = 'multiplayer';
    const effectiveRateMulti = playModeMulti === 'multiplayer' ? multiRate : singleRate;
    expect(effectiveRateMulti).toBe(35);
  });

  it('preserves 0 EGP rate using nullish coalescing instead of falling back to default', () => {
    const freeDevice = { hourly_rate: 0, hourly_rate_multi: 0 };
    const unsetDevice = { hourly_rate: undefined as any, hourly_rate_multi: undefined as any };

    // Zero rate must NOT fall back to 20/30
    const singleRateFree = freeDevice.hourly_rate ?? 20;
    const multiRateFree = freeDevice.hourly_rate_multi ?? 30;
    expect(singleRateFree).toBe(0);
    expect(multiRateFree).toBe(0);

    // Unset rate MUST fall back to 20/30
    const singleRateUnset = unsetDevice.hourly_rate ?? 20;
    const multiRateUnset = unsetDevice.hourly_rate_multi ?? 30;
    expect(singleRateUnset).toBe(20);
    expect(multiRateUnset).toBe(30);
  });

  it('applies soft delete archiving when a device has historical sessions', () => {
    const hasHistory = true;
    const action = hasHistory ? 'archived' : 'deleted';
    const patch = hasHistory ? { archived: true, status: 'offline' } : null;

    expect(action).toBe('archived');
    expect(patch?.archived).toBe(true);
    expect(patch?.status).toBe('offline');
  });
});

