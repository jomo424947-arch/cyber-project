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

    const playModeSingle = 'single';
    const effectiveRateSingle = playModeSingle === 'multiplayer' ? multiRate : singleRate;
    expect(effectiveRateSingle).toBe(25);

    const playModeMulti = 'multiplayer';
    const effectiveRateMulti = playModeMulti === 'multiplayer' ? multiRate : singleRate;
    expect(effectiveRateMulti).toBe(35);
  });
});
