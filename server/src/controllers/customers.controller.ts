import { Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { badRequest, notFound } from '../lib/errors';
import type { DbCustomer } from '../lib/types';

/** GET /api/customers — list all customers. */
export async function listCustomers(_req: Request, res: Response) {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw error;
  res.json({ data: (data ?? []) as DbCustomer[] });
}

/** GET /api/customers/leaderboard — ranking stats. */
export async function getLeaderboard(req: Request, res: Response) {
  const { month } = req.query as { month?: string };

  let startOfMonth: Date;
  let endOfMonth: Date;

  if (month) {
    // Validate format: YYYY-MM with valid month range 01–12.
    if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month)) {
      throw badRequest('Invalid month format, expected YYYY-MM (e.g. 2026-07)');
    }
    const parts = month.split('-');
    const year = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1; // 0-indexed
    if (Number.isNaN(year) || Number.isNaN(m)) {
      throw badRequest('Invalid month value');
    }
    startOfMonth = new Date(Date.UTC(year, m, 1));
    endOfMonth = new Date(Date.UTC(year, m + 1, 1));
  } else {
    const now = new Date();
    startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    endOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  }

  // Fetch all ended sessions for the month
  const { data, error } = await supabase
    .from('sessions')
    .select('id, duration_minutes, total_cost, customer_id, customer:customers(id, name, username)')
    .eq('status', 'ended')
    .not('customer_id', 'is', null)
    .gte('started_at', startOfMonth.toISOString())
    .lt('started_at', endOfMonth.toISOString());

  if (error) throw error;

  const map = new Map<string, { customer_id: string; username: string; name: string; session_count: number; total_minutes: number; total_spend: number }>();

  for (const s of (data || []) as any[]) {
    const customer = s.customer;
    if (!customer) continue;
    const custId = s.customer_id;
    let entry = map.get(custId);
    if (!entry) {
      entry = {
        customer_id: custId,
        username: customer.username || 'unknown',
        name: customer.name || 'Unknown',
        session_count: 0,
        total_minutes: 0,
        total_spend: 0,
      };
      map.set(custId, entry);
    }
    entry.session_count += 1;
    entry.total_minutes += Number(s.duration_minutes || 0);
    entry.total_spend += Number(s.total_cost || 0);
  }

  const list = Array.from(map.values())
    .map(entry => ({
      customer_id: entry.customer_id,
      username: entry.username,
      name: entry.name,
      session_count: entry.session_count,
      total_hours: Number((entry.total_minutes / 60).toFixed(2)),
      total_spend: Number(entry.total_spend.toFixed(2)),
    }))
    .sort((a, b) => b.session_count - a.session_count);

  res.json({ data: list });
}

/** GET /api/customers/:id/profile — customer summary and history. */
export async function getCustomerProfile(req: Request, res: Response) {
  const { id } = req.params;

  // 1. Get customer metadata
  const { data: customer, error: cErr } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (cErr) throw cErr;
  if (!customer) throw notFound('Customer not found');

  // 2. Get customer's session history (including devices)
  const { data: sessions, error: sErr } = await supabase
    .from('sessions')
    .select('*, device:devices(id, name, type, hourly_rate)')
    .eq('customer_id', id)
    .order('started_at', { ascending: false });

  if (sErr) throw sErr;

  // 3. Calculate statistics
  let totalSpend = 0;
  let totalMinutes = 0;
  let endedSessionsCount = 0;
  const deviceTypeCounts = new Map<string, number>();

  for (const s of (sessions || []) as any[]) {
    if (s.status === 'ended') {
      totalSpend += Number(s.total_cost || 0);
      totalMinutes += Number(s.duration_minutes || 0);
      endedSessionsCount += 1;
      
      const type = s.device?.type;
      if (type) {
        deviceTypeCounts.set(type, (deviceTypeCounts.get(type) || 0) + 1);
      }
    }
  }

  let favoriteDeviceType = 'none';
  let maxCount = 0;
  for (const [type, count] of deviceTypeCounts.entries()) {
    if (count > maxCount) {
      maxCount = count;
      favoriteDeviceType = type;
    }
  }

  res.json({
    data: {
      customer: customer as DbCustomer,
      stats: {
        total_spend: Number(totalSpend.toFixed(2)),
        total_sessions: endedSessionsCount,
        total_hours: Number((totalMinutes / 60).toFixed(2)),
        favorite_device_type: favoriteDeviceType,
      },
      sessions: sessions || [],
    }
  });
}
