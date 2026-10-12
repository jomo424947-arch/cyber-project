import { Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { triggerImmediateSync } from '../lib/sync-engine';
import type { DbCafeTable, DbSession } from '../lib/types';

/** GET /api/cafe-tables — list all café tables with linked device details and active session. */
export async function listCafeTables(req: Request, res: Response) {
  const tenantId = req.user!.tenant_id;

  // 1. Fetch tables with device info
  const { data: tablesData, error: tErr } = await supabase
    .from('cafe_tables')
    .select('*, device:devices(id,name,type,status,hourly_rate,hourly_rate_multi)')
    .eq('tenant_id', tenantId)
    .order('table_number', { ascending: true });

  if (tErr) throw tErr;

  const tables = (tablesData || []) as any[];
  const deviceIds = tables.map((t) => t.device_id).filter(Boolean) as string[];

  // 2. Fetch active sessions for these devices
  let activeSessionsMap = new Map<string, any>();
  if (deviceIds.length > 0) {
    const { data: sessionsData } = await supabase
      .from('sessions')
      .select('*, customer:customers(id,name,phone,username)')
      .in('device_id', deviceIds)
      .eq('status', 'active')
      .eq('tenant_id', tenantId);

    const activeSessions = (sessionsData || []) as any[];
    const activeSessionIds = activeSessions.map((s: any) => s.id);

    // 3. Fetch active orders for these sessions
    let ordersBySession = new Map<string, any[]>();
    if (activeSessionIds.length > 0) {
      const { data: ordersData } = await supabase
        .from('session_orders')
        .select('*, product:products(id,name,price,stock)')
        .in('session_id', activeSessionIds)
        .order('created_at', { ascending: true });

      for (const ord of (ordersData || []) as any[]) {
        const existing = ordersBySession.get(ord.session_id) || [];
        existing.push(ord);
        ordersBySession.set(ord.session_id, existing);
      }
    }

    for (const s of activeSessions) {
      const sessionOrders = ordersBySession.get(s.id) || [];
      const ordersTotal = sessionOrders.reduce((sum: number, o: any) => sum + Number(o.total_price || 0), 0);
      activeSessionsMap.set(s.device_id, {
        ...s,
        orders: sessionOrders,
        current_orders_total: Math.round(ordersTotal * 100) / 100,
      });
    }
  }

  // 4. Attach active session and status to each table
  const result: DbCafeTable[] = tables.map((t) => {
    const activeSession = t.device_id ? activeSessionsMap.get(t.device_id) || null : null;
    return {
      ...t,
      active_session: activeSession,
    };
  });

  res.json({ data: result });
}

/** POST /api/cafe-tables — create a new café table. */
export async function createCafeTable(req: Request, res: Response) {
  if (req.user?.role !== 'admin') {
    throw forbidden('Only admins can create café tables');
  }

  const tenantId = req.user!.tenant_id;
  const { table_number, name, capacity = 4, device_id } = req.body;

  // 1. Check if table_number already exists for tenant
  const { data: existingNumber } = await supabase
    .from('cafe_tables')
    .select('id')
    .eq('table_number', table_number)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (existingNumber) {
    throw conflict(`رقم الطاولة "${table_number}" مسجل بالفعل. يرجى اختيار رقم آخر.`);
  }

  let targetDeviceId = device_id;

  if (targetDeviceId) {
    // Verify device exists and belongs to tenant
    const { data: dev, error: dErr } = await supabase
      .from('devices')
      .select('id, name, archived')
      .eq('id', targetDeviceId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (dErr) throw dErr;
    if (!dev) throw notFound('Selected device not found');
    if (dev.archived) throw badRequest('لا يمكن تعيين جهاز مؤرشف لطاولة. يرجى اختيار جهاز نشط.');

    // Check if device already assigned to another table
    const { data: existingTable } = await supabase
      .from('cafe_tables')
      .select('id, name')
      .eq('device_id', targetDeviceId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (existingTable) {
      throw conflict(`الجهاز معين بالفعل في طاولة "${existingTable.name}".`);
    }
  } else {
    // Auto-create a dedicated backing device for this table with hourly_rate = 0
    const cleanNumber = String(table_number).trim();
    const effectiveName = (name && String(name).trim()) || cleanNumber;
    const { data: newDev, error: devCreateErr } = await supabase
      .from('devices')
      .insert({
        name: effectiveName,
        type: 'table',
        hourly_rate: 0,
        hourly_rate_multi: 0,
        status: 'available',
        tenant_id: tenantId,
      })
      .select()
      .single();

    if (devCreateErr) throw devCreateErr;
    targetDeviceId = newDev.id;
  }

  // 2. Insert table
  const cleanNumber = String(table_number).trim();
  const effectiveName = (name && String(name).trim()) || cleanNumber;
  const { data: table, error: tErr } = await supabase
    .from('cafe_tables')
    .insert({
      table_number: cleanNumber,
      name: effectiveName,
      capacity: Number(capacity) || 4,
      device_id: targetDeviceId,
      tenant_id: tenantId,
    })
    .select('*, device:devices(id,name,type,status,hourly_rate,hourly_rate_multi)')
    .single();

  if (tErr) throw tErr;

  triggerImmediateSync();
  res.status(201).json({ data: table });
}

/** PATCH /api/cafe-tables/:id — update a café table. */
export async function updateCafeTable(req: Request, res: Response) {
  if (req.user?.role !== 'admin') {
    throw forbidden('Only admins can update café tables');
  }

  const { id } = req.params;
  const tenantId = req.user!.tenant_id;
  const { table_number, name, capacity } = req.body;

  // Check table exists
  const { data: table, error: fetchErr } = await supabase
    .from('cafe_tables')
    .select('id, table_number, name, device_id')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (fetchErr) throw fetchErr;
  if (!table) throw notFound('Café table not found');

  // If changing table_number, verify uniqueness
  if (table_number && table_number !== table.table_number) {
    const { data: existing } = await supabase
      .from('cafe_tables')
      .select('id')
      .eq('table_number', table_number)
      .eq('tenant_id', tenantId)
      .neq('id', id)
      .maybeSingle();

    if (existing) {
      throw conflict(`رقم الطاولة "${table_number}" مسجل بالفعل.`);
    }
  }

  const cleanTableNumber = table_number !== undefined ? String(table_number).trim() : undefined;
  const effectiveName = (name && String(name).trim()) || cleanTableNumber || table.table_number;
  const updates: Record<string, any> = {};
  if (cleanTableNumber !== undefined) updates.table_number = cleanTableNumber;
  if (effectiveName !== undefined) updates.name = effectiveName;
  if (capacity !== undefined) updates.capacity = Number(capacity);

  // Update backing device name if table name/code changed
  const targetDeviceName = cleanTableNumber || effectiveName;
  if (targetDeviceName && table.device_id) {
    await supabase
      .from('devices')
      .update({ name: targetDeviceName })
      .eq('id', table.device_id)
      .eq('tenant_id', tenantId);
  }

  const { data: updated, error: updErr } = await supabase
    .from('cafe_tables')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select('*, device:devices(id,name,type,status,hourly_rate,hourly_rate_multi)')
    .single();

  if (updErr) throw updErr;

  triggerImmediateSync();
  res.json({ data: updated });
}

/** DELETE /api/cafe-tables/:id — delete a café table (safeguarded against active sessions). */
export async function deleteCafeTable(req: Request, res: Response) {
  if (req.user?.role !== 'admin') {
    throw forbidden('Only admins can delete café tables');
  }

  const { id } = req.params;
  const tenantId = req.user!.tenant_id;

  // 1. Fetch table and backing device
  const { data: table, error: fetchErr } = await supabase
    .from('cafe_tables')
    .select('id, name, device_id')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (fetchErr) throw fetchErr;
  if (!table) throw notFound('Café table not found');

  // 2. CRITICAL SAFEGUARD: Prevent deleting table with active session
  if (table.device_id) {
    const { data: activeSession, error: sErr } = await supabase
      .from('sessions')
      .select('id')
      .eq('device_id', table.device_id)
      .eq('status', 'active')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (sErr) throw sErr;
    if (activeSession) {
      throw badRequest('لا يمكن حذف الطاولة لأنها قيد الاستخدام حالياً وبها جلسة نشطة. يرجى إغلاق الحساب وإنهاء الجلسة أولاً.');
    }
  }

  // 3. Delete table
  const { error: delErr } = await supabase
    .from('cafe_tables')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId);

  if (delErr) throw delErr;

  // 4. Archive/delete backing device
  if (table.device_id) {
    await supabase
      .from('devices')
      .delete()
      .eq('id', table.device_id)
      .eq('tenant_id', tenantId);
  }

  triggerImmediateSync();
  res.status(204).send();
}
