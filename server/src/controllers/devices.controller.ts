import { Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { badRequest, notFound } from '../lib/errors';
import type { DbDevice } from '../lib/types';

/** GET /api/devices — list all devices with current status. */
export async function listDevices(_req: Request, res: Response) {
  const { data, error } = await supabase
    .from('devices')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw error;
  res.json({ data: (data ?? []) as DbDevice[] });
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

  const { error, count } = await supabase
    .from('devices')
    .delete({ count: 'exact' })
    .eq('id', id);

  if (error) throw error;
  if (!count) throw notFound('Device not found');
  res.json({ message: 'Device removed' });
}
