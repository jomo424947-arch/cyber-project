import { Request, Response } from 'express';
import { supabase } from '../lib/supabase';

/**
 * GET /api/reports/revenue — revenue summary.
 * Returns totals for today, this week, this month, plus a per-bucket breakdown.
 */
export async function revenueReport(_req: Request, res: Response) {
  const now = new Date();

  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  const startOfWeek = new Date(now);
  const day = (startOfWeek.getDay() + 6) % 7; // Monday-start
  startOfWeek.setDate(startOfWeek.getDate() - day);
  startOfWeek.setHours(0, 0, 0, 0);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Load all ended sessions with cost in the last 30 days for breakdown.
  const since = new Date(now);
  since.setDate(since.getDate() - 30);

  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('id, started_at, ended_at, total_cost, duration_minutes')
    .eq('status', 'ended')
    .gte('ended_at', since.toISOString())
    .order('ended_at', { ascending: true });

  if (error) throw error;

  const sum = (rows: typeof sessions, from: Date) =>
    rows
      .filter((r) => r.ended_at && new Date(r.ended_at) >= from)
      .reduce((acc, r) => acc + Number(r.total_cost ?? 0), 0);

  const today = sum(sessions, startOfDay);
  const week = sum(sessions, startOfWeek);
  const month = sum(sessions, startOfMonth);

  // Daily breakdown for the chart (last 14 days).
  const daily: { date: string; total: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    const total = sessions
      .filter((r) => {
        if (!r.ended_at) return false;
        const t = new Date(r.ended_at);
        return t >= d && t < next;
      })
      .reduce((acc, r) => acc + Number(r.total_cost ?? 0), 0);
    daily.push({ date: d.toISOString().slice(0, 10), total: Number(total.toFixed(2)) });
  }

  res.json({
    data: {
      totals: {
        today: Number(today.toFixed(2)),
        week: Number(week.toFixed(2)),
        month: Number(month.toFixed(2)),
      },
      daily,
    },
  });
}

/**
 * GET /api/reports/usage — device usage stats + peak hours.
 */
export async function usageReport(_req: Request, res: Response) {
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('id, device_id, started_at, ended_at, duration_minutes')
    .gte('started_at', since.toISOString())
    .order('started_at', { ascending: true });

  if (error) throw error;

  const { data: devices } = await supabase
    .from('devices')
    .select('id, name, type')
    .order('name', { ascending: true });

  // Per-device usage minutes (last 30d).
  const byDevice = new Map<string, number>();
  // Peak hours: count sessions starting in each hour bucket (0-23).
  const hourBuckets = new Array(24).fill(0) as number[];

  for (const s of sessions ?? []) {
    byDevice.set(s.device_id, (byDevice.get(s.device_id) ?? 0) + Number(s.duration_minutes ?? 0));
    const h = new Date(s.started_at).getHours();
    hourBuckets[h] += 1;
  }

  const periodMinutes = 30 * 24 * 60;
  const deviceUsage = (devices ?? []).map((d) => {
    const used = byDevice.get(d.id) ?? 0;
    return {
      device_id: d.id,
      name: d.name,
      type: d.type,
      minutes_used: used,
      utilization: Number(((used / periodMinutes) * 100).toFixed(1)),
    };
  });

  res.json({
    data: {
      devices: deviceUsage,
      peak_hours: hourBuckets.map((count, hour) => ({ hour, count })),
    },
  });
}
