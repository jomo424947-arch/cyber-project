import { Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { toZonedTime, format } from 'date-fns-tz';
import { startOfDay, startOfWeek, startOfMonth, subDays, addDays, getHours } from 'date-fns';

/**
 * GET /api/reports/revenue — revenue summary.
 * Returns totals for today, this week, this month, plus a per-bucket breakdown.
 */
export async function revenueReport(_req: Request, res: Response) {
  const now = new Date();
  const tz = process.env.REPORT_TIMEZONE || 'Africa/Cairo';

  const nowZoned = toZonedTime(now, tz);
  const startOfDayZoned = startOfDay(nowZoned);
  const startOfWeekZoned = startOfWeek(nowZoned, { weekStartsOn: 1 }); // Monday-start
  const startOfMonthZoned = startOfMonth(nowZoned);

  // Load all ended sessions with cost in the last 30 days for breakdown.
  const sinceUtc = subDays(now, 30);

  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('id, started_at, ended_at, total_cost, duration_minutes')
    .eq('status', 'ended')
    .gte('ended_at', sinceUtc.toISOString())
    .order('ended_at', { ascending: true });

  if (error) throw error;

  const sum = (rows: typeof sessions, boundaryZoned: Date) =>
    (rows ?? [])
      .filter((r) => {
        if (!r.ended_at) return false;
        const endedZoned = toZonedTime(new Date(r.ended_at), tz);
        return endedZoned.getTime() >= boundaryZoned.getTime();
      })
      .reduce((acc, r) => acc + Number(r.total_cost ?? 0), 0);

  const today = sum(sessions, startOfDayZoned);
  const week = sum(sessions, startOfWeekZoned);
  const month = sum(sessions, startOfMonthZoned);

  // Daily breakdown for the chart (last 14 days).
  const daily: { date: string; total: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = subDays(nowZoned, i);
    const dayStartBoundary = startOfDay(d);
    const dayEndBoundary = addDays(dayStartBoundary, 1);
    
    const total = (sessions ?? [])
      .filter((r) => {
        if (!r.ended_at) return false;
        const endedZoned = toZonedTime(new Date(r.ended_at), tz);
        return endedZoned.getTime() >= dayStartBoundary.getTime() && endedZoned.getTime() < dayEndBoundary.getTime();
      })
      .reduce((acc, r) => acc + Number(r.total_cost ?? 0), 0);
      
    const dateStr = format(dayStartBoundary, 'yyyy-MM-dd', { timeZone: tz });
    daily.push({ date: dateStr, total: Number(total.toFixed(2)) });
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
  const now = new Date();
  const tz = process.env.REPORT_TIMEZONE || 'Africa/Cairo';
  const sinceUtc = subDays(now, 30);

  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('id, device_id, started_at, ended_at, duration_minutes')
    .gte('started_at', sinceUtc.toISOString())
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
    const startedZoned = toZonedTime(new Date(s.started_at), tz);
    const h = getHours(startedZoned);
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
