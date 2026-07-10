import { Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { badRequest, conflict, notFound } from '../lib/errors';
import type { DbReservation } from '../lib/types';

/** GET /api/reservations — list all reservations. */
export async function listReservations(_req: Request, res: Response) {
  const { data, error } = await supabase
    .from('reservations')
    .select(
      '*, device:devices(id,name,type), customer:customers(id,name,phone)'
    )
    .order('reserved_from', { ascending: true });

  if (error) throw error;
  res.json({ data: (data ?? []) as unknown as DbReservation[] });
}

/** POST /api/reservations — create a new reservation (with conflict check). */
export async function createReservation(req: Request, res: Response) {
  const { device_id, customer_id, customer_name, reserved_from, reserved_until, notes } =
    req.body;

  // 0. Validate window.
  const fromTs = new Date(reserved_from).getTime();
  const untilTs = new Date(reserved_until).getTime();
  if (Number.isNaN(fromTs) || Number.isNaN(untilTs) || fromTs >= untilTs) {
    throw badRequest('reserved_from must be before reserved_until');
  }

  // 1. Resolve / create the customer.
  let finalCustomerId = customer_id as string | null;
  if (!finalCustomerId && customer_name) {
    const { data: newCustomer, error: cErr } = await supabase
      .from('customers')
      .insert({ name: customer_name })
      .select('id')
      .single();
    if (cErr) throw cErr;
    finalCustomerId = newCustomer.id;
  }
  if (!finalCustomerId) throw badRequest('A customer is required');

  // 2. Conflict detection — overlapping, non-cancelled reservations for the same device.
  const { data: conflicts, error: confErr } = await supabase
    .from('reservations')
    .select('id, reserved_from, reserved_until')
    .eq('device_id', device_id)
    .neq('status', 'cancelled')
    .or(
      `reserved_from.lt.${reserved_until},reserved_until.gt.${reserved_from}`
    );

  if (confErr) throw confErr;
  if (conflicts && conflicts.length > 0) {
    throw conflict(
      'This device is already reserved for part of the requested time window',
      'RESERVATION_CONFLICT'
    );
  }

  // 3. Insert the reservation.
  const { data: reservation, error: insErr } = await supabase
    .from('reservations')
    .insert({
      device_id,
      customer_id: finalCustomerId,
      reserved_from,
      reserved_until,
      notes: notes ?? null,
      status: 'pending',
      created_by: req.user!.id,
    })
    .select('*, device:devices(id,name,type), customer:customers(id,name,phone)')
    .single();
  if (insErr) throw insErr;

  // 4. Device status flow: if the reservation starts within 15 minutes, mark reserved.
  const minutesUntilStart = (fromTs - Date.now()) / 60000;
  if (minutesUntilStart <= 15) {
    const { data: device } = await supabase
      .from('devices')
      .select('status')
      .eq('id', device_id)
      .maybeSingle();
    if (device && device.status === 'available') {
      await supabase.from('devices').update({ status: 'reserved' }).eq('id', device_id);
    }
  }

  res.status(201).json({ data: reservation as unknown as DbReservation });
}

/** PATCH /api/reservations/:id — update or cancel a reservation. */
export async function updateReservation(req: Request, res: Response) {
  const { id } = req.params;
  const { status, notes, reserved_from, reserved_until } = req.body;

  const patch: Record<string, unknown> = {};
  if (status) patch.status = status;
  if (notes !== undefined) patch.notes = notes;
  if (reserved_from) patch.reserved_from = reserved_from;
  if (reserved_until) patch.reserved_until = reserved_until;

  const { data: existing, error: loadErr } = await supabase
    .from('reservations')
    .select('id, device_id, status')
    .eq('id', id)
    .maybeSingle();
  if (loadErr) throw loadErr;
  if (!existing) throw notFound('Reservation not found');

  const { data: updated, error: updErr } = await supabase
    .from('reservations')
    .update(patch)
    .eq('id', id)
    .select('*, device:devices(id,name,type), customer:customers(id,name,phone)')
    .single();
  if (updErr) throw updErr;

  // Device status flow: cancelling a reservation reverts the device to available.
  if (status === 'cancelled') {
    const { data: device } = await supabase
      .from('devices')
      .select('status')
      .eq('id', existing.device_id)
      .maybeSingle();
    if (device && device.status === 'reserved') {
      await supabase
        .from('devices')
        .update({ status: 'available' })
        .eq('id', existing.device_id);
    }
  }

  res.json({ data: updated as unknown as DbReservation });
}
