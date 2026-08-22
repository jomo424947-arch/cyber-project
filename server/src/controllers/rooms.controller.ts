import { Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import type { DbRoom } from '../lib/types';

/** GET /api/rooms — list all gaming rooms with linked device details. */
export async function listRooms(req: Request, res: Response) {
  const { data, error } = await supabase
    .from('rooms')
    .select('*, device:devices(id,name,type,status,hourly_rate,hourly_rate_multi)')
    .eq('tenant_id', req.user!.tenant_id)
    .order('created_at', { ascending: true });

  if (error) throw error;

  res.json({ data: (data || []) as DbRoom[] });
}

/** POST /api/rooms — create a new gaming room. */
export async function createRoom(req: Request, res: Response) {
  if (req.user?.role !== 'admin') {
    throw forbidden('Only admins can create gaming rooms');
  }

  const { name, icon = 'sports_esports', device_id, type = 'console', hourly_rate = 20, hourly_rate_multi = 30 } = req.body;

  let targetDeviceId = device_id;

  if (targetDeviceId) {
    // 1. Verify device exists and belongs to current tenant
    const { data: dev, error: dErr } = await supabase
      .from('devices')
      .select('id, name, archived')
      .eq('id', targetDeviceId)
      .eq('tenant_id', req.user!.tenant_id)
      .maybeSingle();

    if (dErr) throw dErr;
    if (!dev) throw notFound('Selected device not found');
    if (dev.archived) throw badRequest('لا يمكن تعيين جهاز مؤرشف لغرفة. يرجى اختيار جهاز نشط.');

    // 2. Check if device is already assigned to another room
    const { data: existingRoom, error: rErr } = await supabase
      .from('rooms')
      .select('id, name')
      .eq('device_id', targetDeviceId)
      .eq('tenant_id', req.user!.tenant_id)
      .maybeSingle();

    if (rErr) throw rErr;
    if (existingRoom) {
      throw conflict(`الجهاز "${dev.name}" معين بالفعل في "${existingRoom.name}". لا يمكن تعيين نفس الجهاز لأكثر من غرفة.`);
    }

    // 3. Update device rates if provided
    if (hourly_rate !== undefined || hourly_rate_multi !== undefined) {
      await supabase
        .from('devices')
        .update({
          hourly_rate: Number(hourly_rate),
          hourly_rate_multi: Number(hourly_rate_multi ?? hourly_rate),
        })
        .eq('id', targetDeviceId)
        .eq('tenant_id', req.user!.tenant_id);
    }
  } else {
    // Auto-create a dedicated device for this room
    const { data: newDev, error: devCreateErr } = await supabase
      .from('devices')
      .insert({
        name: name,
        type: type,
        hourly_rate: Number(hourly_rate),
        hourly_rate_multi: Number(hourly_rate_multi ?? hourly_rate),
        status: 'available',
        tenant_id: req.user!.tenant_id,
      })
      .select()
      .single();

    if (devCreateErr) throw devCreateErr;
    targetDeviceId = newDev.id;
  }

  // 4. Create the room
  const { data: room, error: roomErr } = await supabase
    .from('rooms')
    .insert({
      name,
      icon,
      device_id: targetDeviceId,
      tenant_id: req.user!.tenant_id,
    })
    .select('*, device:devices(id,name,type,status,hourly_rate,hourly_rate_multi)')
    .single();

  if (roomErr) throw roomErr;

  res.status(201).json({ data: room as DbRoom });
}

/** PATCH /api/rooms/:id — update room details and assigned device rates. */
export async function updateRoom(req: Request, res: Response) {
  if (req.user?.role !== 'admin') {
    throw forbidden('Only admins can update gaming rooms');
  }

  const { id } = req.params;
  const { name, icon, device_id, hourly_rate, hourly_rate_multi } = req.body;

  // 1. Fetch current room
  const { data: currentRoom, error: fetchErr } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', req.user!.tenant_id)
    .maybeSingle();

  if (fetchErr) throw fetchErr;
  if (!currentRoom) throw notFound('Gaming room not found');

  const patch: Record<string, any> = {};
  if (name !== undefined) patch.name = name;
  if (icon !== undefined) patch.icon = icon;

  let activeDeviceId = currentRoom.device_id;

  if (device_id !== undefined && device_id !== currentRoom.device_id) {
    if (device_id !== null) {
      // Check if device exists and is not archived
      const { data: targetDev, error: tErr } = await supabase
        .from('devices')
        .select('id, name, archived')
        .eq('id', device_id)
        .eq('tenant_id', req.user!.tenant_id)
        .maybeSingle();

      if (tErr) throw tErr;
      if (!targetDev) throw notFound('Selected device not found');
      if (targetDev.archived) throw badRequest('لا يمكن تعيين جهاز مؤرشف لغرفة.');

      // Check if device is already assigned to another room
      const { data: otherRoom } = await supabase
        .from('rooms')
        .select('id, name')
        .eq('device_id', device_id)
        .eq('tenant_id', req.user!.tenant_id)
        .neq('id', id)
        .maybeSingle();

      if (otherRoom) {
        throw conflict(`هذا الجهاز معين بالفعل في "${otherRoom.name}".`);
      }
    }
    patch.device_id = device_id;
    activeDeviceId = device_id;
  }

  // Update rates on assigned device if provided
  if (activeDeviceId && (hourly_rate !== undefined || hourly_rate_multi !== undefined)) {
    const devPatch: Record<string, any> = {};
    if (hourly_rate !== undefined) devPatch.hourly_rate = Number(hourly_rate);
    if (hourly_rate_multi !== undefined) devPatch.hourly_rate_multi = Number(hourly_rate_multi);

    await supabase
      .from('devices')
      .update(devPatch)
      .eq('id', activeDeviceId)
      .eq('tenant_id', req.user!.tenant_id);
  }

  const { data: updatedRoom, error: updateErr } = await supabase
    .from('rooms')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', req.user!.tenant_id)
    .select('*, device:devices(id,name,type,status,hourly_rate,hourly_rate_multi)')
    .single();

  if (updateErr) throw updateErr;

  res.json({ data: updatedRoom as DbRoom });
}

/** DELETE /api/rooms/:id — delete a gaming room. */
export async function deleteRoom(req: Request, res: Response) {
  if (req.user?.role !== 'admin') {
    throw forbidden('Only admins can delete gaming rooms');
  }

  const { id } = req.params;

  const { data: room, error: fetchErr } = await supabase
    .from('rooms')
    .select('*, device:devices(id,name,status)')
    .eq('id', id)
    .eq('tenant_id', req.user!.tenant_id)
    .maybeSingle();

  if (fetchErr) throw fetchErr;
  if (!room) throw notFound('Gaming room not found');

  // Check if device has an active session
  if (room.device_id) {
    const { data: activeSession } = await supabase
      .from('sessions')
      .select('id')
      .eq('device_id', room.device_id)
      .eq('status', 'active')
      .eq('tenant_id', req.user!.tenant_id)
      .maybeSingle();

    if (activeSession) {
      throw badRequest('لا يمكن حذف الغرفة أثناء وجود جلسة لعب نشطة. يرجى إنهاء الجلسة أولاً.');
    }
  }

  // 1. Delete the room
  const { error: delErr } = await supabase
    .from('rooms')
    .delete()
    .eq('id', id)
    .eq('tenant_id', req.user!.tenant_id);

  if (delErr) throw delErr;

  // 2. Clean up associated device if present
  if (room.device_id) {
    const { data: sessions } = await supabase
      .from('sessions')
      .select('id')
      .eq('device_id', room.device_id)
      .eq('tenant_id', req.user!.tenant_id)
      .limit(1);

    if (sessions && sessions.length > 0) {
      // Has history, archive so invoices/logs are preserved
      await supabase
        .from('devices')
        .update({ archived: true, status: 'offline' })
        .eq('id', room.device_id)
        .eq('tenant_id', req.user!.tenant_id);
    } else {
      // Zero history, delete permanently to prevent orphan ghost devices
      await supabase
        .from('devices')
        .delete()
        .eq('id', room.device_id)
        .eq('tenant_id', req.user!.tenant_id);
    }
  }

  res.json({ message: 'Room deleted successfully', id });
}

