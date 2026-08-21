import { Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { badRequest, forbidden, notFound } from '../lib/errors';
import type { DbDevice } from '../lib/types';

/** GET /api/devices — list all devices with current status. */
export async function listDevices(req: Request, res: Response) {
  const includeArchived = req.query.include_archived === 'true';

  let query = supabase
    .from('devices')
    .select('*')
    .eq('tenant_id', req.user!.tenant_id)
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
      .in('device_id', deviceIds)
      .eq('tenant_id', req.user!.tenant_id);

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
  if (req.user?.role !== 'admin') {
    throw forbidden('Only admins can create devices');
  }
  const { name, type, hourly_rate, hourly_rate_multi, specs } = req.body;

  const { data, error } = await supabase
    .from('devices')
    .insert({
      name,
      type,
      hourly_rate,
      hourly_rate_multi: hourly_rate_multi ?? hourly_rate,
      specs: specs ?? null,
      status: 'available',
      tenant_id: req.user!.tenant_id,
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
  const { name, type, status, hourly_rate, hourly_rate_multi, specs } = req.body;

  // Security: only admins can edit configuration details. Staff can only update status.
  if (req.user?.role !== 'admin') {
    if (name !== undefined || type !== undefined || hourly_rate !== undefined || hourly_rate_multi !== undefined || specs !== undefined) {
      throw forbidden('Only admins can update device settings');
    }
  }

  if (status === 'offline' || status === 'maintenance') {
    const { data: activeSess } = await supabase
      .from('sessions')
      .select('id')
      .eq('device_id', id)
      .eq('status', 'active')
      .eq('tenant_id', req.user!.tenant_id)
      .maybeSingle();

    if (activeSess) {
      throw badRequest(`Cannot set device status to '${status}' while an active session is in progress`);
    }
  }

  const patch: Record<string, unknown> = {};
  if (name !== undefined) patch.name = name;
  if (type !== undefined) patch.type = type;
  if (status !== undefined) patch.status = status;
  if (hourly_rate !== undefined) patch.hourly_rate = hourly_rate;
  if (hourly_rate_multi !== undefined) patch.hourly_rate_multi = hourly_rate_multi;
  if (specs !== undefined) patch.specs = specs;

  const { data, error } = await supabase
    .from('devices')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', req.user!.tenant_id)
    .select()
    .maybeSingle();

  if (error) throw error;
  if (!data) throw notFound('Device not found');
  res.json({ data: data as DbDevice });
}

/** DELETE /api/devices/:id — remove a device permanently (admin only). */
export async function deleteDevice(req: Request, res: Response) {
  if (req.user?.role !== 'admin') {
    throw forbidden('Only admins can delete devices');
  }
  const { id } = req.params;
  const tenantId = req.user!.tenant_id;

  // 1. Unlink any room referencing this device
  await supabase
    .from('rooms')
    .delete()
    .eq('device_id', id)
    .eq('tenant_id', tenantId);

  // 2. Delete any reservations on this device
  await supabase
    .from('reservations')
    .delete()
    .eq('device_id', id)
    .eq('tenant_id', tenantId);

  // 3. Delete any sessions & invoices linked to this device
  const { data: sessions } = await supabase
    .from('sessions')
    .select('id')
    .eq('device_id', id)
    .eq('tenant_id', tenantId);

  if (sessions && sessions.length > 0) {
    for (const s of sessions) {
      await supabase.from('invoices').delete().eq('session_id', s.id).eq('tenant_id', tenantId);
    }
    await supabase.from('sessions').delete().eq('device_id', id).eq('tenant_id', tenantId);
  }

  // 4. Permanent delete device from database
  const { error } = await supabase
    .from('devices')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId);

  if (error) throw error;
  res.json({ message: 'Device deleted permanently', action: 'deleted' });
}
