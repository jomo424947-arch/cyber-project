import { Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { badRequest, notFound } from '../lib/errors';
import type { DbDevice } from '../lib/types';

/** GET /api/devices — list all devices with current status. */
export async function listDevices(req: Request, res: Response) {
  const includeArchived = req.query.include_archived === 'true';

  let query = supabase
    .from('devices')
    .select('*')
    .order('name', { ascending: true });

  if (!includeArchived) {
    query = query.eq('archived', false);
  }

  const { data, error } = await query;
  if (error) throw error;

  const devices = data ?? [];
  if (devices.length > 0) {
    const deviceIds = devices.map((d: any) => d.id);
    const { data: sessionData, error: scError } = await supabase
      .from('sessions')
      .select('device_id')
      .in('device_id', deviceIds);

    const historyMap = new Set<string>();
    if (!scError && sessionData) {
      sessionData.forEach((s: any) => {
        historyMap.add(s.device_id);
      });
    }

    const result = devices.map((d: any) => ({
      ...d,
      has_session_history: historyMap.has(d.id),
    }));
    res.json({ data: result });
    return;
  }

  res.json({ data: [] });
}

/** POST /api/devices — create a new device (admin only). */
export async function createDevice(req: Request, res: Response) {
  const { name, type, hourly_rate, specs } = req.body;

  const { data, error } = await supabase
    .from('devices')
    .insert({
      name,
      type,
      hourly_rate,
      specs: specs ?? null,
      status: 'available',
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') throw badRequest('A device with that name already exists');
    throw error;
  }
  res.status(201).json({ data: data as DbDevice });
}

/** PATCH /api/devices/:id — update device info or status. */
export async function updateDevice(req: Request, res: Response) {
  const { id } = req.params;
  const { name, type, status, hourly_rate, specs } = req.body;

  const patch: Record<string, unknown> = {};
  if (name !== undefined) patch.name = name;
  if (type !== undefined) patch.type = type;
  if (status !== undefined) patch.status = status;
  if (hourly_rate !== undefined) patch.hourly_rate = hourly_rate;
  if (specs !== undefined) patch.specs = specs;

  const { data, error } = await supabase
    .from('devices')
    .update(patch)
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) throw error;
  if (!data) throw notFound('Device not found');
  res.json({ data: data as DbDevice });
}

/** DELETE /api/devices/:id — remove a device (admin only). */
export async function deleteDevice(req: Request, res: Response) {
  const { id } = req.params;

  // Check if device has any session history
  const { data: sessions, error: sErr } = await supabase
    .from('sessions')
    .select('id')
    .eq('device_id', id)
    .limit(1);

  if (sErr) throw sErr;

  if (sessions && sessions.length > 0) {
    // Has history, archive instead of deleting
    const { error: updErr } = await supabase
      .from('devices')
      .update({ archived: true, status: 'offline' })
      .eq('id', id);
    if (updErr) throw updErr;
    res.json({ message: 'Device archived', action: 'archived' });
  } else {
    // Zero history, permanent delete
    const { error, count } = await supabase
      .from('devices')
      .delete({ count: 'exact' })
      .eq('id', id);

    if (error) throw error;
    if (!count) throw notFound('Device not found');
    res.json({ message: 'Device removed', action: 'deleted' });
  }
}
