import { Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { badRequest, conflict, notFound } from '../lib/errors';
import type { DbSession } from '../lib/types';

/**
 * Business rule: minimum billed duration is 30 minutes, and time is rounded
 * UP to the nearest whole minute.
 */
const MIN_BILLING_MINUTES = 30;

/** GET /api/sessions — list all sessions (filter: active, ended). */
export async function listSessions(req: Request, res: Response) {
  const { status } = req.query as { status?: 'active' | 'ended' };

  let query = supabase
    .from('sessions')
    .select(
      '*, device:devices(id,name,type,hourly_rate), customer:customers(id,name,phone,email,username)'
    )
    .order('started_at', { ascending: false });

  if (status === 'active' || status === 'ended') {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) throw error;

  const now = new Date();
  const sessions = (data ?? []).map((s: any) => {
    let liveOvertime = s.is_overtime;
    if (s.status === 'active' && s.session_type === 'fixed' && s.scheduled_end) {
      const graceMs = (s.grace_period_minutes || 0) * 60000;
      const scheduledEndTime = new Date(s.scheduled_end).getTime();
      liveOvertime = now.getTime() > (scheduledEndTime + graceMs);
    }
    return {
      ...s,
      is_overtime: liveOvertime,
    };
  });

  res.json({ data: sessions as unknown as DbSession[] });
}

/** POST /api/sessions/start — start a session, set device to in_use. */
export async function startSession(req: Request, res: Response) {
  const { 
    device_id, 
    customer_id, 
    customer_username, 
    customer_name, 
    customer_phone,
    session_type = 'open',
    started_at,
    scheduled_end,
    hourly_rate_override,
    grace_period_minutes = 0
  } = req.body;

  // 1. Resolve / create the customer.
  let finalCustomerId = customer_id as string | null;

  if (!finalCustomerId && customer_username) {
    // Search customer by username
    const { data: customerRow, error: cFetchErr } = await supabase
      .from('customers')
      .select('id')
      .eq('username', customer_username)
      .maybeSingle();

    if (cFetchErr) throw cFetchErr;

    if (customerRow) {
      finalCustomerId = customerRow.id;
    } else {
      // Create new customer with username
      const { data: newCustomer, error: cInsErr } = await supabase
        .from('customers')
        .insert({ 
          username: customer_username,
          name: customer_name || customer_username, 
          phone: customer_phone ?? null 
        })
        .select('id')
        .single();
      if (cInsErr) throw cInsErr;
      finalCustomerId = newCustomer.id;
    }
  } else if (!finalCustomerId && customer_name) {
    // Legacy support: create customer with unique generated username
    const cleanName = customer_name.replace(/[^a-zA-Z0-9_]/g, '');
    const uniqueSuffix = Math.random().toString(36).substring(2, 6);
    const generatedUsername = `${cleanName}_${uniqueSuffix}`.toLowerCase().substring(0, 30);

    const { data: newCustomer, error: cErr } = await supabase
      .from('customers')
      .insert({ 
        username: generatedUsername,
        name: customer_name, 
        phone: customer_phone ?? null 
      })
      .select('id')
      .single();
    if (cErr) throw cErr;
    finalCustomerId = newCustomer.id;
  }

  if (!finalCustomerId) throw badRequest('A customer is required');

  // 2. Verify the device exists and is startable.
  const { data: device, error: dErr } = await supabase
    .from('devices')
    .select('id, status, hourly_rate')
    .eq('id', device_id)
    .maybeSingle();
  if (dErr) throw dErr;
  if (!device) throw notFound('Device not found');

  if (device.status === 'in_use') throw conflict('Device is already in use', 'DEVICE_BUSY');
  if (device.status === 'offline') throw conflict('Device is offline', 'DEVICE_OFFLINE');

  // 3. Guard against an already-active session for this device.
  const { data: existing } = await supabase
    .from('sessions')
    .select('id')
    .eq('device_id', device_id)
    .eq('status', 'active')
    .maybeSingle();
  if (existing) throw conflict('Device already has an active session', 'SESSION_ACTIVE');

  // 4. Validate time bounds.
  const now = new Date();
  const sessionStart = started_at ? new Date(started_at) : now;

  if (sessionStart.getTime() > now.getTime() + 10000) { // allow 10s skew
    throw badRequest('Start time cannot be in the future');
  }

  if (session_type === 'fixed') {
    if (!scheduled_end) {
      throw badRequest('Scheduled end is required for fixed-duration sessions');
    }
    const sessionEnd = new Date(scheduled_end);
    if (sessionEnd.getTime() <= sessionStart.getTime()) {
      throw badRequest('Scheduled end must be after started_at');
    }
  }

  const isBackdated = started_at && (now.getTime() - sessionStart.getTime() > 60000);

  // 5. Create the session.
  const { data: session, error: sErr } = await supabase
    .from('sessions')
    .insert({
      device_id,
      customer_id: finalCustomerId,
      session_type,
      started_at: sessionStart.toISOString(),
      scheduled_end: session_type === 'fixed' ? new Date(scheduled_end).toISOString() : null,
      hourly_rate_override: hourly_rate_override !== undefined && hourly_rate_override !== null ? Number(hourly_rate_override) : null,
      grace_period_minutes: session_type === 'fixed' ? grace_period_minutes : 0,
      edited_start_at: !!isBackdated,
      status: 'active',
      created_by: req.user!.id,
    })
    .select(
      '*, device:devices(id,name,type,hourly_rate), customer:customers(id,name,phone,username)'
    )
    .single();
  if (sErr) throw sErr;

  // 6. Audit start backdating if applicable
  if (isBackdated) {
    const { error: auditErr } = await supabase
      .from('session_audit_log')
      .insert({
        session_id: session.id,
        edited_by: req.user!.id,
        field_changed: 'started_at',
        old_value: null,
        new_value: sessionStart.toISOString(),
      });
    if (auditErr) {
      console.error('[audit] failed to insert start backdate log:', auditErr.message);
    }
  }

  // 7. Flip the device to in_use.
  const { error: updErr } = await supabase
    .from('devices')
    .update({ status: 'in_use' })
    .eq('id', device_id);
  if (updErr) throw updErr;

  res.status(201).json({ data: session as unknown as DbSession });
}

/** PATCH /api/sessions/:id — edit an active session. */
export async function editSession(req: Request, res: Response) {
  const { id } = req.params;
  const { started_at, scheduled_end, hourly_rate_override, grace_period_minutes } = req.body;

  const { data: session, error: sErr } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (sErr) throw sErr;
  if (!session) throw notFound('Session not found');
  if (session.status === 'ended') throw badRequest('Cannot edit an ended session');

  const updates: Record<string, any> = {};
  const auditEntries: any[] = [];

  if (started_at !== undefined) {
    const newStart = new Date(started_at);
    if (newStart.getTime() > new Date().getTime() + 10000) {
      throw badRequest('Start time cannot be in the future');
    }
    const oldVal = session.started_at;
    const newVal = newStart.toISOString();
    if (oldVal !== newVal) {
      updates.started_at = newVal;
      updates.edited_start_at = true;
      auditEntries.push({
        session_id: id,
        edited_by: req.user!.id,
        field_changed: 'started_at',
        old_value: oldVal,
        new_value: newVal,
      });
    }
  }

  const currentStart = new Date(updates.started_at || session.started_at);

  if (scheduled_end !== undefined) {
    const newVal = scheduled_end ? new Date(scheduled_end).toISOString() : null;
    const oldVal = session.scheduled_end ? new Date(session.scheduled_end).toISOString() : null;
    if (oldVal !== newVal) {
      if (newVal && new Date(newVal).getTime() <= currentStart.getTime()) {
        throw badRequest('Scheduled end must be after started_at');
      }
      updates.scheduled_end = newVal;
      auditEntries.push({
        session_id: id,
        edited_by: req.user!.id,
        field_changed: 'scheduled_end',
        old_value: oldVal,
        new_value: newVal,
      });
    }
  }

  if (hourly_rate_override !== undefined) {
    const oldVal = session.hourly_rate_override !== null ? Number(session.hourly_rate_override) : null;
    const newVal = hourly_rate_override !== null ? Number(hourly_rate_override) : null;
    if (oldVal !== newVal) {
      updates.hourly_rate_override = newVal;
      auditEntries.push({
        session_id: id,
        edited_by: req.user!.id,
        field_changed: 'hourly_rate_override',
        old_value: oldVal !== null ? oldVal.toString() : null,
        new_value: newVal !== null ? newVal.toString() : null,
      });
    }
  }

  if (grace_period_minutes !== undefined) {
    const oldVal = Number(session.grace_period_minutes);
    const newVal = Number(grace_period_minutes);
    if (oldVal !== newVal) {
      updates.grace_period_minutes = newVal;
      auditEntries.push({
        session_id: id,
        edited_by: req.user!.id,
        field_changed: 'grace_period_minutes',
        old_value: oldVal.toString(),
        new_value: newVal.toString(),
      });
    }
  }

  if (Object.keys(updates).length > 0) {
    const { data: updated, error: updErr } = await supabase
      .from('sessions')
      .update(updates)
      .eq('id', id)
      .select('*, device:devices(id,name,type,hourly_rate), customer:customers(id,name,phone,username)')
      .single();

    if (updErr) throw updErr;

    if (auditEntries.length > 0) {
      const { error: logErr } = await supabase
        .from('session_audit_log')
        .insert(auditEntries);
      if (logErr) {
        console.error('[audit] failed to insert audit logs:', logErr.message);
      }
    }

    res.json({ data: updated as unknown as DbSession });
  } else {
    const { data: current, error: fetchErr } = await supabase
      .from('sessions')
      .select('*, device:devices(id,name,type,hourly_rate), customer:customers(id,name,phone,username)')
      .eq('id', id)
      .single();
    if (fetchErr) throw fetchErr;
    res.json({ data: current as unknown as DbSession });
  }
}

/** POST /api/sessions/:id/extend — add minutes to scheduled end. */
export async function extendSession(req: Request, res: Response) {
  const { id } = req.params;
  const { additional_minutes } = req.body;

  const { data: session, error: sErr } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (sErr) throw sErr;
  if (!session) throw notFound('Session not found');
  if (session.status === 'ended') throw badRequest('Session already ended');
  if (session.session_type !== 'fixed') {
    throw badRequest('Only fixed-duration sessions can be extended');
  }
  if (!session.scheduled_end) {
    throw badRequest('Session does not have a scheduled end time');
  }

  const oldEnd = new Date(session.scheduled_end);
  const newEnd = new Date(oldEnd.getTime() + additional_minutes * 60000);

  const { data: updated, error: updErr } = await supabase
    .from('sessions')
    .update({ scheduled_end: newEnd.toISOString() })
    .eq('id', id)
    .select('*, device:devices(id,name,type,hourly_rate), customer:customers(id,name,phone,username)')
    .single();

  if (updErr) throw updErr;

  const { error: logErr } = await supabase
    .from('session_audit_log')
    .insert({
      session_id: id,
      edited_by: req.user!.id,
      field_changed: 'scheduled_end',
      old_value: oldEnd.toISOString(),
      new_value: newEnd.toISOString(),
    });
  if (logErr) {
    console.error('[audit] failed to insert extension log:', logErr.message);
  }

  res.json({ data: updated as unknown as DbSession });
}

/** POST /api/sessions/:id/end — end a session, compute duration + cost, generate invoice. */
export async function endSession(req: Request, res: Response) {
  const { id } = req.params;
  const { payment_method = 'cash', mark_paid = false, ended_at } = req.body;

  // 1. Load the active session + device rate.
  const { data: session, error: sErr } = await supabase
    .from('sessions')
    .select('*, device:devices(id,name,type,hourly_rate)')
    .eq('id', id)
    .maybeSingle();
  if (sErr) throw sErr;
  if (!session) throw notFound('Session not found');
  if (session.status === 'ended') throw conflict('Session already ended', 'SESSION_ENDED');

  // 2. Compute duration and cost
  const startedAt = new Date(session.started_at).getTime();
  const sessionEnd = ended_at ? new Date(ended_at) : new Date();

  if (sessionEnd.getTime() < startedAt) {
    throw badRequest('Session end time cannot be before start time');
  }
  if (sessionEnd.getTime() > new Date().getTime() + 10000) {
    throw badRequest('Session end time cannot be in the future');
  }

  const rawMinutes = Math.max(0, Math.ceil((sessionEnd.getTime() - startedAt) / 60000));
  const durationMinutes = Math.max(MIN_BILLING_MINUTES, rawMinutes);

  const effectiveRate = Number(session.hourly_rate_override !== null && session.hourly_rate_override !== undefined ? session.hourly_rate_override : session.device.hourly_rate);
  const baseCost = (durationMinutes / 60) * effectiveRate;

  let overtimeMinutes = 0;
  let isOvertime = false;
  let overtimeCost = 0;

  if (session.session_type === 'fixed' && session.scheduled_end) {
    const scheduledMinutes = Math.max(0, Math.ceil((new Date(session.scheduled_end).getTime() - startedAt) / 60000));
    const graceMinutes = Number(session.grace_period_minutes || 0);

    overtimeMinutes = Math.max(0, durationMinutes - scheduledMinutes - graceMinutes);
    if (overtimeMinutes > 0) {
      isOvertime = true;
      const multiplier = Number(process.env.OVERTIME_RATE_MULTIPLIER || 1.0);
      overtimeCost = (overtimeMinutes / 60) * effectiveRate * multiplier;
    }
  }

  const totalCost = Number((baseCost + overtimeCost).toFixed(2));

  // 3. End the session.
  const { data: ended, error: endErr } = await supabase
    .from('sessions')
    .update({
      ended_at: sessionEnd.toISOString(),
      duration_minutes: durationMinutes,
      total_cost: totalCost,
      status: 'ended',
      is_overtime: isOvertime,
      overtime_minutes: overtimeMinutes > 0 ? overtimeMinutes : null,
    })
    .eq('id', id)
    .select(
      '*, device:devices(id,name,type,hourly_rate), customer:customers(id,name,phone,username)'
    )
    .single();
  if (endErr) throw endErr;

  // 4. Auto-generate an invoice.
  const { data: invoice, error: invErr } = await supabase
    .from('invoices')
    .insert({
      session_id: id,
      amount: totalCost,
      paid: !!mark_paid,
      payment_method,
      paid_at: mark_paid ? sessionEnd.toISOString() : null,
    })
    .select('*')
    .single();
  if (invErr) throw invErr;

  // 5. Audit end backdating if applicable
  const isEndBackdated = ended_at && (new Date().getTime() - sessionEnd.getTime() > 60000);
  if (isEndBackdated) {
    const { error: auditErr } = await supabase
      .from('session_audit_log')
      .insert({
        session_id: id,
        edited_by: req.user!.id,
        field_changed: 'ended_at',
        old_value: null,
        new_value: sessionEnd.toISOString(),
      });
    if (auditErr) {
      console.error('[audit] failed to insert end backdate log:', auditErr.message);
    }
  }

  // 6. Free the device.
  const { error: devErr } = await supabase
    .from('devices')
    .update({ status: 'available' })
    .eq('id', session.device_id);
  if (devErr) throw devErr;

  res.json({
    data: ended as unknown as DbSession,
    invoice,
    billing: { raw_minutes: rawMinutes, billed_minutes: durationMinutes, total_cost: totalCost, overtime_minutes: overtimeMinutes, overtime_cost: Number(overtimeCost.toFixed(2)) },
  });
}

/** GET /api/sessions/:id/audit-logs — list audit trails for a session. */
export async function getSessionAuditLogs(req: Request, res: Response) {
  const { id } = req.params;

  const { data, error } = await supabase
    .from('session_audit_log')
    .select('*, editor:users(full_name)')
    .eq('session_id', id)
    .order('edited_at', { ascending: false });

  if (error) throw error;
  res.json({ data: data || [] });
}

