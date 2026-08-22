import { Request, Response } from 'express';
import crypto from 'crypto';
import { supabase } from '../lib/supabase';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import type { DbSession } from '../lib/types';
import { calculateSessionCost, calculateInvoiceAdjustments } from '../lib/billing';
import { getDb, saveDatabase, setSuppressSave } from '../lib/database';


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
    .eq('tenant_id', req.user!.tenant_id)
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

  // 0. Verify staff has an active shift before starting any session
  const { data: activeShift, error: shiftErr } = await supabase
    .from('shifts')
    .select('id')
    .eq('user_id', req.user!.id)
    .eq('status', 'active')
    .eq('tenant_id', req.user!.tenant_id)
    .maybeSingle();

  if (shiftErr) throw shiftErr;
  if (!activeShift) {
    throw badRequest('لا يمكنك بدء جلسة بدون وجود وردية مفتوحة. يرجى بدء الوردية أولاً من صفحة الورديات.', 'NO_ACTIVE_SHIFT');
  }

  // 1. Resolve / create the customer.
  let finalCustomerId = customer_id as string | null;

  if (!finalCustomerId && customer_username) {
    // Search customer by username
    const { data: customerRow, error: cFetchErr } = await supabase
      .from('customers')
      .select('id')
      .eq('username', customer_username)
      .eq('tenant_id', req.user!.tenant_id)
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
          phone: customer_phone ?? null,
          tenant_id: req.user!.tenant_id
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
    const uniqueSuffix = crypto.randomBytes(3).toString('hex');
    const generatedUsername = `${cleanPrefix}_${uniqueSuffix}`.toLowerCase().substring(0, 30);

    const { data: newCustomer, error: cErr } = await supabase
      .from('customers')
      .insert({ 
        username: generatedUsername,
        name: nameToUse, 
        phone: customer_phone ?? null,
        tenant_id: req.user!.tenant_id
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
    .eq('tenant_id', req.user!.tenant_id)
    .maybeSingle();
  if (dErr) throw dErr;
  if (!device) throw notFound('Device not found');

  if (device.status === 'in_use') throw conflict('Device is already in use', 'DEVICE_BUSY');
  if (device.status === 'offline') throw conflict('Device is offline', 'DEVICE_OFFLINE');

  // Select rate based on play mode
  const deviceBaseRate = play_mode === 'multiplayer' ? Number(device.hourly_rate_multi) : Number(device.hourly_rate);

  // Authorization check on hourly rate override.
  let finalOverride: number | null = null;
  if (hourly_rate_override !== undefined && hourly_rate_override !== null) {
    const overrideNum = Number(hourly_rate_override);
    if (overrideNum !== deviceBaseRate) {
      if (req.user?.role !== 'admin') {
        throw forbidden('Only admins can override the hourly rate');
      }
      finalOverride = overrideNum;
    }
  }

  // 3. Guard against an already-active session for this device.
  const { data: existing } = await supabase
    .from('sessions')
    .select('id')
    .eq('device_id', device_id)
    .eq('status', 'active')
    .eq('tenant_id', req.user!.tenant_id)
    .maybeSingle();
  if (existing) throw conflict('Device already has an active session', 'SESSION_ACTIVE');

  // 4. Validate time bounds.
  const now = new Date();
  const sessionStart = started_at ? new Date(started_at) : now;

  if (sessionStart.getTime() > now.getTime() + 10000) { // allow 10s skew
    throw badRequest('Start time cannot be in the future');
  }

  const isBackdated = started_at && (now.getTime() - sessionStart.getTime() > 60000);
  if (isBackdated) {
    if (req.user?.role !== 'admin') {
      throw forbidden('Only admins can backdate session start times');
    }
    if (now.getTime() - sessionStart.getTime() > 30 * 86400000) {
      throw badRequest('Session start time cannot be backdated by more than 30 days');
    }
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
      hourly_rate_override: finalOverride,
      grace_period_minutes: session_type === 'fixed' ? grace_period_minutes : 0,
      edited_start_at: !!isBackdated,
      status: 'active',
      created_by: req.user!.id,
      tenant_id: req.user!.tenant_id,
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
    .eq('id', device_id)
    .eq('tenant_id', req.user!.tenant_id);
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
    .eq('tenant_id', req.user!.tenant_id)
    .maybeSingle();

  if (sErr) throw sErr;
  if (!session) throw notFound('Session not found');
  if (session.status === 'ended') throw badRequest('Cannot edit an ended session');

  const updates: Record<string, any> = {};
  const auditEntries: any[] = [];

  if (started_at !== undefined) {
    const newStart = new Date(started_at);
    const oldStart = new Date(session.started_at);
    const nowTime = new Date().getTime();
    if (newStart.getTime() > nowTime + 10000) {
      throw badRequest('Start time cannot be in the future');
    }

    // THEFT / FRAUD PREVENTION:
    // Moving start time forward (e.g. 2:00 PM -> 3:00 PM) deletes played time and enables theft.
    if (newStart.getTime() > oldStart.getTime() + 1000) {
      throw badRequest('Start time cannot be moved forward to a later time than the original start time');
    }

    const backdateMs = nowTime - newStart.getTime();
    if (backdateMs > 60000 && req.user?.role !== 'admin') {
      throw forbidden('Only admins can backdate session start times');
    }
    if (backdateMs > 30 * 86400000) {
      throw badRequest('Session start time cannot be backdated by more than 30 days');
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

    if (targetRate !== deviceRate || (newVal !== null && req.user?.role !== 'admin')) {
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
      .eq('tenant_id', req.user!.tenant_id)
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
      .eq('tenant_id', req.user!.tenant_id)
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
    .eq('tenant_id', req.user!.tenant_id)
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
    .eq('tenant_id', req.user!.tenant_id)
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

/** POST /api/sessions/:id/transfer — transfer an active session from one device/room to another. */
export async function transferSession(req: Request, res: Response) {
  const { id } = req.params;
  const { target_device_id, play_mode, hourly_rate_override } = req.body;

  // 1. Fetch active session
  const { data: session, error: sErr } = await supabase
    .from('sessions')
    .select('*, device:devices(id,name,type,hourly_rate,hourly_rate_multi)')
    .eq('id', id)
    .eq('tenant_id', req.user!.tenant_id)
    .maybeSingle();

  if (sErr) throw sErr;
  if (!session) throw notFound('Session not found');
  if (session.status === 'ended') throw conflict('Cannot transfer an ended session', 'SESSION_ENDED');
  if (session.is_paused) {
    throw badRequest('لا يمكن تحويل الجلسة وهي معلّقة (Paused). يرجى استئناف الجلسة أولاً قبل تحويلها.', 'SESSION_PAUSED');
  }

  if (session.device_id === target_device_id) {
    throw badRequest('الجهاز أو الغرفة الهدف هي نفس الجهاز الحالي للجلسة');
  }

  // 2. Fetch target device
  const { data: targetDevice, error: tdErr } = await supabase
    .from('devices')
    .select('id, name, type, status, hourly_rate, hourly_rate_multi, archived')
    .eq('id', target_device_id)
    .eq('tenant_id', req.user!.tenant_id)
    .maybeSingle();

  if (tdErr) throw tdErr;
  if (!targetDevice) throw notFound('Target device not found');
  if (targetDevice.archived || targetDevice.status === 'offline') {
    throw badRequest('الجهاز أو الغرفة الهدف غير متاحة (Offline)');
  }
  if (targetDevice.status === 'in_use') {
    throw conflict('الجهاز أو الغرفة الهدف مشغولة حالياً بجلسة أخرى', 'DEVICE_BUSY');
  }

  // Guard against an already-active session for target device
  const { data: existingTargetSession } = await supabase
    .from('sessions')
    .select('id')
    .eq('device_id', target_device_id)
    .eq('status', 'active')
    .eq('tenant_id', req.user!.tenant_id)
    .maybeSingle();

  if (existingTargetSession) {
    throw conflict('الجهاز الهدف لديه جلسة نشطة بالفعل', 'SESSION_ACTIVE');
  }

  // 3. Compute cost and duration for the segment on the current device
  const now = new Date();
  const startedAt = new Date(session.started_at);
  const currentRate = session.play_mode === 'multiplayer'
    ? Number(session.device?.hourly_rate_multi ?? 0)
    : Number(session.device?.hourly_rate ?? 0);

  const effectiveRate = Number(
    session.hourly_rate_override !== undefined && session.hourly_rate_override !== null
      ? session.hourly_rate_override
      : currentRate
  );

  const rawMinutes = Math.max(0, Math.ceil((now.getTime() - startedAt.getTime()) / 60000));
  const pausedMinutes = Number(session.total_paused_minutes || 0);
  const effectiveMinutes = Math.max(0, rawMinutes - pausedMinutes);
  const segmentCost = Math.round((effectiveMinutes / 60) * effectiveRate * 100) / 100;

  // 4. Save transfer segment record
  const { data: transferRecord, error: trErr } = await supabase
    .from('session_transfers')
    .insert({
      session_id: id,
      from_device_id: session.device_id,
      to_device_id: target_device_id,
      started_at: session.started_at,
      transferred_at: now.toISOString(),
      duration_minutes: effectiveMinutes,
      hourly_rate: effectiveRate,
      play_mode: session.play_mode,
      cost: segmentCost,
      transferred_by: req.user!.id,
      tenant_id: req.user!.tenant_id,
    })
    .select('*, from_device:devices!from_device_id(id,name,type), to_device:devices!to_device_id(id,name,type)')
    .single();

  if (trErr) throw trErr;

  // 5. Update devices statuses
  // Free old device
  await supabase
    .from('devices')
    .update({ status: 'available' })
    .eq('id', session.device_id)
    .eq('tenant_id', req.user!.tenant_id);

  // Mark target device in_use
  await supabase
    .from('devices')
    .update({ status: 'in_use' })
    .eq('id', target_device_id)
    .eq('tenant_id', req.user!.tenant_id);

  // 6. Update session: switch device_id, set started_at to now for new segment, update play_mode if provided
  const newPlayMode = play_mode || session.play_mode;
  const newOverride = hourly_rate_override !== undefined ? hourly_rate_override : null;

  const { data: updatedSession, error: updErr } = await supabase
    .from('sessions')
    .update({
      device_id: target_device_id,
      started_at: now.toISOString(),
      play_mode: newPlayMode,
      hourly_rate_override: newOverride,
      total_paused_minutes: 0,
    })
    .eq('id', id)
    .eq('tenant_id', req.user!.tenant_id)
    .select('*, device:devices(id,name,type,hourly_rate,hourly_rate_multi), customer:customers(id,name,phone,username)')
    .single();

  if (updErr) throw updErr;

  // 7. Audit log
  await supabase.from('session_audit_log').insert({
    session_id: id,
    edited_by: req.user!.id,
    field_changed: 'transfer_device',
    old_value: `${session.device?.name ?? 'Device'} (${rawMinutes} دقيقة - ${segmentCost} ج)`,
    new_value: targetDevice.name,
  });

  res.json({
    data: updatedSession as unknown as DbSession,
    transfer: transferRecord,
  });
}

/** GET /api/sessions/:id/transfers — list all transfer segments for a session. */
export async function listSessionTransfers(req: Request, res: Response) {
  const { id } = req.params;

  const { data: session, error: sErr } = await supabase
    .from('sessions')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', req.user!.tenant_id)
    .maybeSingle();

  if (sErr) throw sErr;
  if (!session) throw notFound('Session not found');

  const { data, error } = await supabase
    .from('session_transfers')
    .select('*, from_device:devices!from_device_id(id,name,type), to_device:devices!to_device_id(id,name,type), transferrer:users(full_name)')
    .eq('session_id', id)
    .order('created_at', { ascending: true });

  if (error) {
    if (error.code === 'PGRST205' || error.message?.includes('does not exist')) {
      res.json({ data: [] });
      return;
    }
    throw error;
  }

  res.json({ data: data || [] });
}

/** POST /api/sessions/:id/end — end a session, compute duration + cost, generate invoice. */
export async function endSession(req: Request, res: Response) {
  const { id } = req.params;
  const { 
    payment_method = 'cash', 
    mark_paid = false, 
    ended_at,
    discount_type = 'none',
    discount_value = 0,
    service_fee = 0,
    service_rate = 0,
    rounding_delta = 0,
    notes = null,
  } = req.body;

  // 1. Load the active session + device rate.
  const { data: session, error: sErr } = await supabase
    .from('sessions')
    .select('*, device:devices(id,name,type,hourly_rate,hourly_rate_multi)')
    .eq('id', id)
    .eq('tenant_id', req.user!.tenant_id)
    .maybeSingle();
  if (sErr) throw sErr;
  if (!session) throw notFound('Session not found');
  if (session.status === 'ended') throw conflict('Session already ended', 'SESSION_ENDED');
  if (session.is_paused) {
    throw badRequest('Please resume the session before ending it', 'SESSION_PAUSED');
  }

  // 2. Compute duration and cost for current active segment
  const startedAt = new Date(session.started_at).getTime();
  const sessionEnd = ended_at ? new Date(ended_at) : new Date();

  if (sessionEnd.getTime() < startedAt) {
    throw badRequest('Session end time cannot be before start time');
  }
  if (sessionEnd.getTime() > new Date().getTime() + 10000) {
    throw badRequest('Session end time cannot be in the future');
  }

  // Check backdate permission BEFORE any DB writes
  const isEndBackdated = ended_at && (new Date().getTime() - sessionEnd.getTime() > 60000);
  if (isEndBackdated && req.user?.role !== 'admin') {
    throw forbidden('Only admins can backdate session end times');
  }

  const deviceHourlyRate = session.play_mode === 'multiplayer' 
    ? Number(session.device?.hourly_rate_multi ?? 0) 
    : Number(session.device?.hourly_rate ?? 0);

  // Fetch prior transfer segments
  let previousTransfersCost = 0;
  let previousTransfersMinutes = 0;
  try {
    const { data: transfers, error: trErr } = await supabase
      .from('session_transfers')
      .select('cost, duration_minutes')
      .eq('session_id', id);

    if (!trErr && transfers) {
      previousTransfersCost = transfers.reduce((sum: number, t: any) => sum + Number(t.cost || 0), 0);
      previousTransfersMinutes = transfers.reduce((sum: number, t: any) => sum + Number(t.duration_minutes || 0), 0);
    }
  } catch (trCatchErr) {
    console.warn('[session] Could not query session_transfers:', trCatchErr);
  }

  const {
    rawMinutes,
    pausedMinutes,
    effectiveMinutes,
    billedMinutes,
    baseCost,
    overtimeMinutes,
    isOvertime,
    overtimeCost,
    totalCost: currentSegmentCost,
  } = calculateSessionCost({
    startedAt: session.started_at,
    endedAt: sessionEnd,
    deviceHourlyRate,
    hourlyRateOverride: session.hourly_rate_override,
    sessionType: session.session_type,
    scheduledEnd: session.scheduled_end,
    gracePeriodMinutes: session.grace_period_minutes,
    overtimeRateMultiplier: Number(process.env.OVERTIME_RATE_MULTIPLIER || 1.0),
    pausedMinutes: Number(session.total_paused_minutes || 0),
    minBillingMinutes: previousTransfersMinutes > 0 ? 0 : 30,
  });

  const totalDeviceCost = Math.round((currentSegmentCost + previousTransfersCost) * 100) / 100;
  const totalBilledMinutes = billedMinutes + previousTransfersMinutes;

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
    const sumCents = (orders ?? []).reduce((sum: number, ord: any) => sum + Math.round(Number(ord.total_price) * 100), 0);
    cafeTotalCost = sumCents / 100;
  }

  const rawSubtotal = Math.round((totalDeviceCost + cafeTotalCost) * 100) / 100;

  // Compute adjustments: Discount, Service Fee, and Cash Rounding
  const adj = calculateInvoiceAdjustments({
    subtotal: rawSubtotal,
    discountType: discount_type,
    discountValue: Number(discount_value || 0),
    serviceFee: Number(service_fee || 0),
    serviceRate: Number(service_rate || 0),
    roundingDelta: Number(rounding_delta || 0),
  });

  const finalTotalCost = adj.finalAmount;

  // FIX: Use SQLite transaction (offline mode) to keep all writes atomic.
  const isOfflineMode = process.env.OFFLINE_MODE === 'true';
  let rawDb: any = null;
  if (isOfflineMode) {
    rawDb = getDb();
    setSuppressSave(true); // suppress intermediate disk saves during transaction
    rawDb.run('BEGIN');
  }

  let ended: any = null;
  let invoice: any = null;

  try {
    // 3. End the session atomically.
    const { data: endedData, error: endErr } = await supabase
      .from('sessions')
      .update({
        ended_at: sessionEnd.toISOString(),
        duration_minutes: totalBilledMinutes,
        total_cost: finalTotalCost,
        status: 'ended',
        is_overtime: isOvertime,
        overtime_minutes: overtimeMinutes > 0 ? overtimeMinutes : null,
      })
      .eq('id', id)
      .eq('status', 'active')
      .eq('tenant_id', req.user!.tenant_id)
      .select(
        '*, device:devices(id,name,type,hourly_rate,hourly_rate_multi), customer:customers(id,name,phone,username)'
      )
      .maybeSingle();

    if (endErr) throw endErr;
    if (!endedData) throw conflict('Session already ended or not found', 'SESSION_ENDED');
    ended = endedData;

    // 4. Auto-generate an invoice linked to the staff's or branch's active shift if present.
    let activeShiftId: string | null = null;
    try {
      let { data: activeShift } = await supabase
        .from('shifts')
        .select('id, total_revenue')
        .eq('user_id', req.user!.id)
        .eq('status', 'active')
        .eq('tenant_id', req.user!.tenant_id)
        .maybeSingle();

      if (!activeShift) {
        const { data: tenantShift } = await supabase
          .from('shifts')
          .select('id, total_revenue')
          .eq('status', 'active')
          .eq('tenant_id', req.user!.tenant_id)
          .order('started_at', { ascending: false })
          .maybeSingle();
        activeShift = tenantShift;
      }

      if (activeShift) {
        activeShiftId = activeShift.id;
        if (mark_paid && finalTotalCost > 0) {
          const newRev = Number(activeShift.total_revenue || 0) + finalTotalCost;
          await supabase
            .from('shifts')
            .update({ total_revenue: newRev })
            .eq('id', activeShift.id)
            .eq('tenant_id', req.user!.tenant_id);
        }
      }
    } catch (shiftErr) {
      console.warn('[sessions] Could not link active shift to invoice:', shiftErr);
    }

    // Check if invoice already exists for this session to prevent UNIQUE constraint collisions
    const { data: existingInv } = await supabase
      .from('invoices')
      .select('id')
      .eq('session_id', id)
      .maybeSingle();

    const invoicePayload = {
      session_id: id,
      amount: finalTotalCost,
      subtotal: adj.subtotal,
      discount_amount: adj.discountAmount,
      discount_type,
      discount_value: Number(discount_value || 0),
      service_fee: adj.serviceFee,
      service_rate: Number(service_rate || 0),
      rounding_delta: adj.roundingDelta,
      notes: notes ?? null,
      paid: !!mark_paid,
      payment_method,
      paid_at: mark_paid ? sessionEnd.toISOString() : null,
      shift_id: activeShiftId,
      created_by: req.user!.id,
      tenant_id: req.user!.tenant_id,
    };

    if (existingInv) {
      const { data: updInv, error: invUpdErr } = await supabase
        .from('invoices')
        .update(invoicePayload)
        .eq('id', existingInv.id)
        .select('*')
        .single();
      if (invUpdErr) throw invUpdErr;
      invoice = updInv;
    } else {
      const { data: invoiceData, error: invErr } = await supabase
        .from('invoices')
        .insert(invoicePayload)
        .select('*')
        .single();
      if (invErr) throw invErr;
      invoice = invoiceData;
    }

    // 5. Audit end backdating if applicable
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

    // 6. Free the device (unless it was archived/deleted).
    const newDeviceStatus = session.device?.archived ? 'offline' : 'available';
    const { error: devErr } = await supabase
      .from('devices')
      .update({ status: newDeviceStatus })
      .eq('id', session.device_id)
      .eq('tenant_id', req.user!.tenant_id);
    if (devErr) throw devErr;

    // Commit & persist
    if (rawDb) {
      rawDb.run('COMMIT');
      setSuppressSave(false);
      saveDatabase();
    }
  } catch (err) {
    // Rollback on any failure — device and session stay consistent
    if (rawDb) {
      try { rawDb.run('ROLLBACK'); } catch { /* ignore rollback errors */ }
      setSuppressSave(false);
    } else {
      if (ended) {
        supabase
          .from('devices')
          .update({ status: 'available' })
          .eq('id', session.device_id)
          .eq('tenant_id', req.user!.tenant_id)
          .then(({ error: freeErr }: { error: any }) => {
            if (freeErr) console.error('[session] Failed to free device after error:', freeErr.message);
          });
      }
    }
    throw err;
  }

  res.json({
    data: ended as unknown as DbSession,
    invoice,
    billing: { 
      raw_minutes: rawMinutes, 
      paused_minutes: session.total_paused_minutes || 0,
      effective_minutes: effectiveMinutes,
      billed_minutes: totalBilledMinutes, 
      device_cost: totalDeviceCost,
      current_segment_cost: currentSegmentCost,
      transfers_cost: previousTransfersCost,
      cafe_cost: cafeTotalCost,
      subtotal: adj.subtotal,
      discount_amount: adj.discountAmount,
      service_fee: adj.serviceFee,
      rounding_delta: adj.roundingDelta,
      total_cost: finalTotalCost, 
      overtime_minutes: overtimeMinutes, 
      overtime_cost: overtimeCost 
    },
  });
}

/** POST /api/sessions/:id/pause — pause an active session (excludes idle time from billing). */
export async function pauseSession(req: Request, res: Response) {
  const { id } = req.params;
  const { reason } = req.body as { reason?: string };

  const { data: session, error: sErr } = await supabase
    .from('sessions')
    .select('id, status, is_paused')
    .eq('id', id)
    .eq('tenant_id', req.user!.tenant_id)
    .maybeSingle();

  if (sErr) throw sErr;
  if (!session) throw notFound('Session not found');
  if (session.status === 'ended') throw badRequest('Cannot pause an ended session');
  if (session.is_paused) throw conflict('Session is already paused', 'SESSION_ALREADY_PAUSED');

  // Server-generated timestamp ONLY — never accept a client-supplied paused_at.
  const pausedAt = new Date();

  const { data: pauseRow, error: pErr } = await supabase
    .from('session_pauses')
    .insert({
      session_id: id,
      tenant_id: req.user!.tenant_id,
      paused_at: pausedAt.toISOString(),
      paused_by: req.user!.id,
      reason: reason ?? null,
    })
    .select('*')
    .single();

  if (pErr) {
    if ((pErr as any).code === '23505') {
      throw conflict('Session is already paused', 'SESSION_ALREADY_PAUSED');
    }
    throw pErr;
  }

  const { data: updated, error: updErr } = await supabase
    .from('sessions')
    .update({ is_paused: true })
    .eq('id', id)
    .eq('tenant_id', req.user!.tenant_id)
    .select('*, device:devices(id,name,type,hourly_rate,hourly_rate_multi), customer:customers(id,name,phone,username)')
    .single();

  if (updErr) throw updErr;

  // Reuse the existing audit trail so it shows up in the "Logs" button automatically.
  await supabase.from('session_audit_log').insert({
    session_id: id,
    edited_by: req.user!.id,
    field_changed: 'paused_at',
    old_value: null,
    new_value: pausedAt.toISOString(),
  });

  res.json({ data: updated as unknown as DbSession, pause: pauseRow });
}

/** POST /api/sessions/:id/resume — resume a paused session. */
export async function resumeSession(req: Request, res: Response) {
  const { id } = req.params;

  const { data: session, error: sErr } = await supabase
    .from('sessions')
    .select('id, status, is_paused, total_paused_minutes')
    .eq('id', id)
    .eq('tenant_id', req.user!.tenant_id)
    .maybeSingle();

  if (sErr) throw sErr;
  if (!session) throw notFound('Session not found');
  if (session.status === 'ended') throw badRequest('Cannot resume an ended session');
  if (!session.is_paused) throw conflict('Session is not paused', 'SESSION_NOT_PAUSED');

  const { data: openPause, error: opErr } = await supabase
    .from('session_pauses')
    .select('*')
    .eq('session_id', id)
    .is('resumed_at', null)
    .maybeSingle();

  if (opErr) throw opErr;
  if (!openPause) throw conflict('No active pause found for this session', 'SESSION_NOT_PAUSED');

  // Server-generated timestamp ONLY.
  const resumedAt = new Date();
  const pausedAt = new Date(openPause.paused_at);
  const thisPauseMinutes = Math.max(0, Math.round((resumedAt.getTime() - pausedAt.getTime()) / 60000));

  const { error: closeErr } = await supabase
    .from('session_pauses')
    .update({ resumed_at: resumedAt.toISOString(), resumed_by: req.user!.id })
    .eq('id', openPause.id)
    .eq('tenant_id', req.user!.tenant_id);
  if (closeErr) throw closeErr;

  const newTotalPaused = Number(session.total_paused_minutes || 0) + thisPauseMinutes;

  const { data: updated, error: updErr } = await supabase
    .from('sessions')
    .update({ is_paused: false, total_paused_minutes: newTotalPaused })
    .eq('id', id)
    .eq('tenant_id', req.user!.tenant_id)
    .select('*, device:devices(id,name,type,hourly_rate,hourly_rate_multi), customer:customers(id,name,phone,username)')
    .single();
  if (updErr) throw updErr;

  await supabase.from('session_audit_log').insert({
    session_id: id,
    edited_by: req.user!.id,
    field_changed: 'resumed_at',
    old_value: openPause.paused_at,
    new_value: resumedAt.toISOString(),
  });

  res.json({ data: updated as unknown as DbSession });
}

/** GET /api/sessions/:id/pauses — list pause periods for a session (for the invoice breakdown). */
export async function listSessionPauses(req: Request, res: Response) {
  const { id } = req.params;

  const { data: session, error: sErr } = await supabase
    .from('sessions')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', req.user!.tenant_id)
    .maybeSingle();
  if (sErr) throw sErr;
  if (!session) throw notFound('Session not found');

  const { data, error } = await supabase
    .from('session_pauses')
    .select('*')
    .eq('session_id', id)
    .order('paused_at', { ascending: true });
  if (error) throw error;

  res.json({ data: data || [] });
}

/** POST /api/sessions/:id/orders — add a café order to a session. */
export async function addSessionOrder(req: Request, res: Response) {
  const { id: sessionId } = req.params;
  const { product_id, quantity } = req.body;

  // 1. Verify session is active and belongs to current tenant
  const { data: session, error: sErr } = await supabase
    .from('sessions')
    .select('id, status')
    .eq('id', sessionId)
    .eq('tenant_id', req.user!.tenant_id)
    .maybeSingle();

  if (sErr) throw sErr;
  if (!session) throw notFound('Session not found');
  if (session.status === 'ended') {
    throw badRequest('Cannot add café orders to an ended session');
  }

  // 2. Fetch product details for tenant
  const { data: product, error: pErr } = await supabase
    .from('products')
    .select('id, name, price, stock')
    .eq('id', product_id)
    .eq('tenant_id', req.user!.tenant_id)
    .maybeSingle();

  if (pErr) throw pErr;
  if (!product) throw notFound('Product not found');

  const requestedQty = Number(quantity);
  const unitPrice = Number(product.price);
  const totalPrice = Math.round(unitPrice * requestedQty * 100) / 100;

  // 3. Atomically decrement stock
  const { data: rpcRows, error: rpcErr } = await supabase.rpc('decrement_product_stock', {
    p_product_id: product_id,
    p_tenant_id: req.user!.tenant_id,
    p_qty: requestedQty,
  });

  if (rpcErr) throw rpcErr;
  const updatedProduct = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
  if (!updatedProduct) {
    throw badRequest(`الكمية المتاحة بالمخزون للمنتج "${product.name}" غير كافية. المتاح حالياً: ${Number(product.stock ?? 0)}`);
  }

  // 4. Insert order
  const { data: order, error: insErr } = await supabase
    .from('session_orders')
    .insert({
      session_id: sessionId,
      product_id,
      quantity: requestedQty,
      unit_price: unitPrice,
      total_price: totalPrice,
    })
    .select('*, product:products(id,name,price,stock)')
    .single();

  if (insErr) throw insErr;

  // 5. Log stock decrement
  await supabase.from('product_stock_logs').insert({
    product_id,
    tenant_id: req.user!.tenant_id,
    actor_id: req.user!.id,
    change_type: 'sale',
    delta: -requestedQty,
    balance_after: updatedProduct.stock,
    reason: `Session order added to session`,
  });

  res.status(201).json({ data: order });
}

/** DELETE /api/sessions/:id/orders/:orderId — void/remove an order line from an active session. */
export async function voidSessionOrder(req: Request, res: Response) {
  const { id: sessionId, orderId } = req.params;

  // 1. Verify session exists, belongs to tenant, and is active
  const { data: session, error: sErr } = await supabase
    .from('sessions')
    .select('id, status')
    .eq('id', sessionId)
    .eq('tenant_id', req.user!.tenant_id)
    .maybeSingle();

  if (sErr) throw sErr;
  if (!session) throw notFound('Session not found');
  if (session.status === 'ended') {
    throw badRequest('Cannot void café orders from an ended session');
  }

  // 2. Fetch session order and product details
  const { data: order, error: oErr } = await supabase
    .from('session_orders')
    .select('*, product:products(id, name, stock)')
    .eq('id', orderId)
    .eq('session_id', sessionId)
    .maybeSingle();

  if (oErr) throw oErr;
  if (!order) throw notFound('Order line not found');

  const product = order.product;
  const restoredQty = Number(order.quantity || 0);

  // 3. Restore product stock if product exists
  if (product && product.id) {
    const currentStock = Number(product.stock ?? 0);
    const newStock = currentStock + restoredQty;

    const { error: stockErr } = await supabase
      .from('products')
      .update({ stock: newStock })
      .eq('id', product.id)
      .eq('tenant_id', req.user!.tenant_id);

    if (stockErr) {
      console.error('[session] Failed to restore product stock on void:', stockErr.message);
    }

    // Log stock adjustment
    await supabase.from('product_stock_logs').insert({
      product_id: product.id,
      tenant_id: req.user!.tenant_id,
      actor_id: req.user!.id,
      change_type: 'void_order',
      delta: restoredQty,
      balance_after: newStock,
      reason: `Voided order from session`,
    });
  }

  // 4. Delete the session order line
  const { error: delErr } = await supabase
    .from('session_orders')
    .delete()
    .eq('id', orderId);

  if (delErr) throw delErr;

  // 5. Log audit trail entry in session_audit_log
  await supabase.from('session_audit_log').insert({
    session_id: sessionId,
    edited_by: req.user!.id,
    field_changed: 'void_cafe_order',
    old_value: `${product?.name ?? 'Item'} x${restoredQty} (${order.total_price})`,
    new_value: 'voided',
  });

  res.json({ success: true, voided: order });
}

/** GET /api/sessions/:id/orders — list all café orders for a session. */
export async function listSessionOrders(req: Request, res: Response) {
  const { id: sessionId } = req.params;

  // Verify session belongs to tenant
  const { data: session, error: sErr } = await supabase
    .from('sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('tenant_id', req.user!.tenant_id)
    .maybeSingle();

  if (sErr) throw sErr;
  if (!session) throw notFound('Session not found');

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

  // Verify session belongs to tenant
  const { data: session, error: sErr } = await supabase
    .from('sessions')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', req.user!.tenant_id)
    .maybeSingle();

  if (sErr) throw sErr;
  if (!session) throw notFound('Session not found');

  const { data, error } = await supabase
    .from('session_audit_log')
    .select('*, editor:users(full_name)')
    .eq('session_id', id)
    .order('edited_at', { ascending: false });

  if (error) throw error;
  res.json({ data: data || [] });
}

