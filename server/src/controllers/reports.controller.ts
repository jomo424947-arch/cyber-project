import { Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { toZonedTime, format } from 'date-fns-tz';
import { startOfDay, startOfWeek, startOfMonth, subDays, addDays, getHours } from 'date-fns';

function parseDateUtc(val: any): Date {
  if (val instanceof Date) return val;
  if (!val) return new Date(0);
  let s = String(val).trim();
  if (s.includes(' ') && !s.includes('T')) {
    s = s.replace(' ', 'T') + 'Z';
  }
  return new Date(s);
}

/**
 * GET /api/reports/revenue — revenue summary.
 * Returns totals for today, this week, this month, plus a per-bucket breakdown.
 */
export async function revenueReport(req: Request, res: Response) {
  const now = new Date();
  const tz = process.env.REPORT_TIMEZONE || 'Africa/Cairo';

  const nowZoned = toZonedTime(now, tz);
  const startOfDayZoned = startOfDay(nowZoned);
  const startOfWeekZoned = startOfWeek(nowZoned, { weekStartsOn: 1 }); // Monday-start
  const startOfMonthZoned = startOfMonth(nowZoned);

  // Load all ended sessions in the last 30 days for breakdown.
  const sinceUtc = subDays(now, 30);

  // 1. Fetch tenant sessions for the period
  const sessionsRes = await supabase
    .from('sessions')
    .select('id, started_at, ended_at, total_cost, duration_minutes')
    .eq('status', 'ended')
    .eq('tenant_id', req.user!.tenant_id)
    .gte('ended_at', sinceUtc.toISOString())
    .order('ended_at', { ascending: true });

  if (sessionsRes.error) {
    console.error('[reports] sessions query error:', sessionsRes.error);
    throw sessionsRes.error;
  }

  const sessions = sessionsRes.data ?? [];
  const sessionIds = sessions.map((s: any) => s.id);

  // 2. Fetch session_orders (only for tenant's sessions) and standalone_orders in parallel
  const [sessionOrdersRes, standaloneOrdersRes] = await Promise.all([
    sessionIds.length > 0
      ? supabase
          .from('session_orders')
          .select('id, session_id, total_price, created_at')
          .in('session_id', sessionIds)
          .gte('created_at', sinceUtc.toISOString())
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('standalone_orders')
      .select('id, product_id, total_price, created_at')
      .eq('tenant_id', req.user!.tenant_id)
      .gte('created_at', sinceUtc.toISOString()),
  ]);

  if (sessionOrdersRes.error) {
    console.warn('[reports] session_orders query warning:', sessionOrdersRes.error);
  }
  if (standaloneOrdersRes.error) {
    console.warn('[reports] standalone_orders query warning:', standaloneOrdersRes.error);
  }

  const sessionOrders = sessionOrdersRes.data ?? [];
  const standaloneOrders = standaloneOrdersRes.data ?? [];

  // Map session orders sum per session ID
  const sessionOrdersMap = new Map<string, number>();
  for (const ord of sessionOrders) {
    if (ord.session_id) {
      sessionOrdersMap.set(
        ord.session_id,
        (sessionOrdersMap.get(ord.session_id) ?? 0) + Number(ord.total_price || 0)
      );
    }
  }

  // Helper: compute device revenue for sessions ending >= boundary
  const calcDeviceRevenue = (boundaryZoned: Date) => {
    return sessions
      .filter((s: any) => {
        if (!s.ended_at) return false;
        const endedZoned = toZonedTime(parseDateUtc(s.ended_at), tz);
        return endedZoned.getTime() >= boundaryZoned.getTime();
      })
      .reduce((acc: number, s: any) => {
        const cafePortion = sessionOrdersMap.get(s.id) ?? 0;
        const devicePortion = Math.max(0, Number(s.total_cost ?? 0) - cafePortion);
        return acc + devicePortion;
      }, 0);
  };

  // Helper: compute total cafe revenue (session orders + standalone orders) created/ended >= boundary
  const calcCafeRevenue = (boundaryZoned: Date) => {
    const sessionCafe = sessions
      .filter((s: any) => {
        if (!s.ended_at) return false;
        const endedZoned = toZonedTime(parseDateUtc(s.ended_at), tz);
        return endedZoned.getTime() >= boundaryZoned.getTime();
      })
      .reduce((acc: number, s: any) => acc + (sessionOrdersMap.get(s.id) ?? 0), 0);

    const standaloneCafe = standaloneOrders
      .filter((ord: any) => {
        const createdZoned = toZonedTime(parseDateUtc(ord.created_at), tz);
        return createdZoned.getTime() >= boundaryZoned.getTime();
      })
      .reduce((acc: number, ord: any) => acc + Number(ord.total_price || 0), 0);

    return sessionCafe + standaloneCafe;
  };

  const todayDevice = calcDeviceRevenue(startOfDayZoned);
  const todayCafe = calcCafeRevenue(startOfDayZoned);
  const today = todayDevice + todayCafe;

  const weekDevice = calcDeviceRevenue(startOfWeekZoned);
  const weekCafe = calcCafeRevenue(startOfWeekZoned);
  const week = weekDevice + weekCafe;

  const monthDevice = calcDeviceRevenue(startOfMonthZoned);
  const monthCafe = calcCafeRevenue(startOfMonthZoned);
  const month = monthDevice + monthCafe;

  // Daily breakdown for the chart (last 14 days) including both devices & all cafe orders
  const daily: { date: string; total: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = subDays(nowZoned, i);
    const dayStartBoundary = startOfDay(d);
    const dayEndBoundary = addDays(dayStartBoundary, 1);

    // Sessions ending in this day
    const daySessions = sessions.filter((s: any) => {
      if (!s.ended_at) return false;
      const endedZoned = toZonedTime(parseDateUtc(s.ended_at), tz);
      return endedZoned.getTime() >= dayStartBoundary.getTime() && endedZoned.getTime() < dayEndBoundary.getTime();
    });

    const dayDevice = daySessions.reduce((acc: number, s: any) => {
      const cafePortion = sessionOrdersMap.get(s.id) ?? 0;
      return acc + Math.max(0, Number(s.total_cost ?? 0) - cafePortion);
    }, 0);

    const daySessionCafe = daySessions.reduce((acc: number, s: any) => {
      return acc + (sessionOrdersMap.get(s.id) ?? 0);
    }, 0);

    // Standalone orders in this day
    const dayStandaloneCafe = standaloneOrders
      .filter((ord: any) => {
        const createdZoned = toZonedTime(parseDateUtc(ord.created_at), tz);
        return createdZoned.getTime() >= dayStartBoundary.getTime() && createdZoned.getTime() < dayEndBoundary.getTime();
      })
      .reduce((acc: number, ord: any) => acc + Number(ord.total_price || 0), 0);

    const total = dayDevice + daySessionCafe + dayStandaloneCafe;
    const dateStr = format(dayStartBoundary, 'yyyy-MM-dd', { timeZone: tz });
    daily.push({ date: dateStr, total: Number(total.toFixed(2)) });
  }

  res.json({
    data: {
      totals: {
        today: Number(today.toFixed(2)),
        today_device: Number(todayDevice.toFixed(2)),
        today_cafe: Number(todayCafe.toFixed(2)),
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
export async function usageReport(req: Request, res: Response) {
  const now = new Date();
  const tz = process.env.REPORT_TIMEZONE || 'Africa/Cairo';
  const sinceUtc = subDays(now, 30);

  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('id, device_id, started_at, ended_at, duration_minutes')
    .eq('tenant_id', req.user!.tenant_id)
    .gte('started_at', sinceUtc.toISOString())
    .order('started_at', { ascending: true });

  if (error) throw error;

  const { data: devices } = await supabase
    .from('devices')
    .select('id, name, type')
    .eq('tenant_id', req.user!.tenant_id)
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
  const deviceUsage = (devices ?? []).map((d: any) => {
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
