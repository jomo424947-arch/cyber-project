import { Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import type { DbSession } from '../lib/types';
import { calculateSessionCost } from '../lib/billing';


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
      '*, device:devices(id,name,type,hourly_rate,hourly_rate_multi), customer:customers(id,name,phone,email,username)'
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
    play_mode = 'single',
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
      if (cInsErr) {
        // Handle race condition: another request created this username concurrently.
        if ((cInsErr as any).code === '23505') {
          throw conflict('A customer with that username already exists', 'CUSTOMER_USERNAME_CONFLICT');
        }
        throw cInsErr;
      }
      finalCustomerId = newCustomer.id;
    }
  } else if (!finalCustomerId) {
    // Make customer_name optional: fallback to 'Walk-in' if empty or not provided
    const nameToUse = (customer_name && customer_name.trim()) ? customer_name.trim() : 'Walk-in';
    const cleanName = nameToUse.replace(/[^a-zA-Z0-9_]/g, '');
    const cleanPrefix = cleanName || 'walkin';
    const uniqueSuffix = Math.random().toString(36).substring(2, 6);
    const generatedUsername = `${cleanPrefix}_${uniqueSuffix}`.toLowerCase().substring(0, 30);

    const { data: newCustomer, error: cErr } = await supabase
      .from('customers')
      .insert({ 
        username: generatedUsername,
        name: nameToUse, 
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
    .select('id, status, hourly_rate, hourly_rate_multi')
    .eq('id', device_id)
    .maybeSingle();
  if (dErr) throw dErr;
  if (!device) throw notFound('Device not found');

  if (device.status === 'in_use') throw conflict('Device is already in use', 'DEVICE_BUSY');
  if (device.status === 'offline') throw conflict('Device is offline', 'DEVICE_OFFLINE');

  // Select rate based on play mode
  const deviceBaseRate = play_mode === 'multiplayer' ? Number(device.hourly_rate_multi) : Number(device.hourly_rate);

  // Authorization check on hourly rate override.
  if (hourly_rate_override !== undefined && hourly_rate_override !== null) {
    if (Number(hourly_rate_override) !== deviceBaseRate) {
      if (req.user?.role !== 'admin') {
        throw forbidden('Only admins can override the hourly rate');
      }
    }
  }

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
      play_mode,
      started_at: sessionStart.toISOString(),
      scheduled_end: session_type === 'fixed' ? new Date(scheduled_end).toISOString() : null,
      hourly_rate_override: hourly_rate_override !== undefined && hourly_rate_override !== null ? Number(hourly_rate_override) : null,
      grace_period_minutes: session_type === 'fixed' ? grace_period_minutes : 0,
      edited_start_at: !!isBackdated,
      status: 'active',
      created_by: req.user!.id,
    })
    .select(
      '*, device:devices(id,name,type,hourly_rate,hourly_rate_multi), customer:customers(id,name,phone,username)'
    )
    .single();

  if (sErr) {
    if ((sErr as any).code === '23505') {
      throw conflict('Device already has an active session', 'SESSION_ACTIVE');
    }
    throw sErr;
  }

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
    .select('*, device:devices(id,name,type,hourly_rate,hourly_rate_multi)')
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
    const baseRate = session.play_mode === 'multiplayer' ? Number(session.device?.hourly_rate_multi) : Number(session.device?.hourly_rate);
    const deviceRate = session.device ? baseRate : 0;
    const newVal = hourly_rate_override !== null && hourly_rate_override !== undefined ? Number(hourly_rate_override) : null;
    const targetRate = newVal !== null ? newVal : deviceRate;

    if (targetRate !== deviceRate) {
      if (req.user?.role !== 'admin') {
        throw forbidden('Only admins can override the hourly rate');
      }
    }

    const oldVal = session.hourly_rate_override !== null ? Number(session.hourly_rate_override) : null;
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
      .select('*, device:devices(id,name,type,hourly_rate,hourly_rate_multi), customer:customers(id,name,phone,username)')
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
      .select('*, device:devices(id,name,type,hourly_rate,hourly_rate_multi), customer:customers(id,name,phone,username)')
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
    .select('*, device:devices(id,name,type,hourly_rate,hourly_rate_multi), customer:customers(id,name,phone,username)')
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
    .select('*, device:devices(id,name,type,hourly_rate,hourly_rate_multi)')
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

  const deviceHourlyRate = session.play_mode === 'multiplayer' 
    ? Number(session.device?.hourly_rate_multi ?? 0) 
    : Number(session.device?.hourly_rate ?? 0);

  const {
    rawMinutes,
    billedMinutes,
    baseCost,
    overtimeMinutes,
    isOvertime,
    overtimeCost,
    totalCost,
  } = calculateSessionCost({
    startedAt: session.started_at,
    endedAt: sessionEnd,
    deviceHourlyRate,
    hourlyRateOverride: session.hourly_rate_override,
    sessionType: session.session_type,
    scheduledEnd: session.scheduled_end,
    gracePeriodMinutes: session.grace_period_minutes,
    overtimeRateMultiplier: Number(process.env.OVERTIME_RATE_MULTIPLIER || 1.0),
  });

  // Fetch total café orders cost
  let cafeTotalCost = 0;
  const { data: orders, error: oErr } = await supabase
    .from('session_orders')
    .select('total_price')
    .eq('session_id', id);

  if (oErr) {
    if (oErr.code === 'PGRST205') {
      console.warn('[session] session_orders table does not exist. Defaulting cafe cost to 0.');
    } else {
      throw oErr;
    }
  } else {
    cafeTotalCost = (orders ?? []).reduce((sum, ord) => sum + Number(ord.total_price), 0);
  }
  const finalTotalCost = Number((totalCost + cafeTotalCost).toFixed(2));

  // 3. End the session.
  const { data: ended, error: endErr } = await supabase
    .from('sessions')
    .update({
      ended_at: sessionEnd.toISOString(),
      duration_minutes: billedMinutes,
      total_cost: finalTotalCost,
      status: 'ended',
      is_overtime: isOvertime,
      overtime_minutes: overtimeMinutes > 0 ? overtimeMinutes : null,
    })
    .eq('id', id)
    .select(
      '*, device:devices(id,name,type,hourly_rate,hourly_rate_multi), customer:customers(id,name,phone,username)'
    )
    .single();
  if (endErr) throw endErr;

  // 4. Auto-generate an invoice.
  const { data: invoice, error: invErr } = await supabase
    .from('invoices')
    .insert({
      session_id: id,
      amount: finalTotalCost,
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
    billing: { 
      raw_minutes: rawMinutes, 
      billed_minutes: billedMinutes, 
      device_cost: totalCost, 
      cafe_cost: cafeTotalCost, 
      total_cost: finalTotalCost, 
      overtime_minutes: overtimeMinutes, 
      overtime_cost: overtimeCost 
    },
  });
}

/** POST /api/sessions/:id/orders — add a café order to a session. */
export async function addSessionOrder(req: Request, res: Response) {
  const { id: sessionId } = req.params;
  const { product_id, quantity } = req.body;

  // 1. Verify session is active
  const { data: session, error: sErr } = await supabase
    .from('sessions')
    .select('id, status')
    .eq('id', sessionId)
    .maybeSingle();

  if (sErr) throw sErr;
  if (!session) throw notFound('Session not found');
  if (session.status === 'ended') {
    throw badRequest('Cannot add café orders to an ended session');
  }

  // 2. Fetch product price
  const { data: product, error: pErr } = await supabase
    .from('products')
    .select('id, price')
    .eq('id', product_id)
    .maybeSingle();

  if (pErr) throw pErr;
  if (!product) throw notFound('Product not found');

  const unitPrice = Number(product.price);
  const totalPrice = Number((unitPrice * Number(quantity)).toFixed(2));

  // 3. Insert order
  const { data: order, error: insErr } = await supabase
    .from('session_orders')
    .insert({
      session_id: sessionId,
      product_id,
      quantity,
      unit_price: unitPrice,
      total_price: totalPrice,
    })
    .select('*, product:products(id,name,price)')
    .single();

  if (insErr) throw insErr;
  res.status(201).json({ data: order });
}

/** GET /api/sessions/:id/orders — list all café orders for a session. */
export async function listSessionOrders(req: Request, res: Response) {
  const { id: sessionId } = req.params;

  const { data: orders, error } = await supabase
    .from('session_orders')
    .select('*, product:products(id,name,price)')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  res.json({ data: orders ?? [] });
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

