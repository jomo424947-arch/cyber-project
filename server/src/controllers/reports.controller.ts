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
 * FINANCIAL SOURCE OF TRUTH: Revenue is calculated from paid invoices and standalone orders,
 * ensuring accuracy across shifts, timezones, and DST transitions without phantom overtime leaks.
 */
export async function revenueReport(req: Request, res: Response) {
  const now = new Date();
  const tz = process.env.REPORT_TIMEZONE || 'Africa/Cairo';

  const nowZoned = toZonedTime(now, tz);
  const startOfDayZoned = startOfDay(nowZoned);
  const startOfWeekZoned = startOfWeek(nowZoned, { weekStartsOn: 1 }); // Monday-start
  const startOfMonthZoned = startOfMonth(nowZoned);

  // Load all paid invoices in the last 30 days for revenue calculation and charts.
  const sinceUtc = subDays(now, 30);

  // 1. Fetch tenant paid invoices for the period
  const invoicesRes = await supabase
    .from('invoices')
    .select('id, session_id, amount, subtotal, discount_amount, service_fee, paid, paid_at, issued_at')
    .eq('tenant_id', req.user!.tenant_id)
    .eq('paid', true)
    .or(`paid_at.gte.${sinceUtc.toISOString()},issued_at.gte.${sinceUtc.toISOString()}`)
    .order('paid_at', { ascending: true });

  if (invoicesRes.error) {
    console.error('[reports] invoices query error:', invoicesRes.error);
    throw invoicesRes.error;
  }

  const invoices = invoicesRes.data ?? [];
  const sessionIds = invoices.map((inv: any) => inv.session_id).filter(Boolean);

  // 2. Fetch session_orders (only for the invoiced sessions) and standalone_orders in parallel
  const [sessionOrdersRes, standaloneOrdersRes] = await Promise.all([
    sessionIds.length > 0
      ? supabase
          .from('session_orders')
          .select('id, session_id, total_price, created_at')
          .in('session_id', sessionIds)
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

  // Helper: compute device revenue from paid invoices >= boundary
  const calcDeviceRevenue = (boundaryZoned: Date) => {
    return invoices
      .filter((inv: any) => {
        const paymentDate = parseDateUtc(inv.paid_at || inv.issued_at);
        const paymentZoned = toZonedTime(paymentDate, tz);
        return paymentZoned.getTime() >= boundaryZoned.getTime();
      })
      .reduce((acc: number, inv: any) => {
        const cafeTotalForSession = sessionOrdersMap.get(inv.session_id) ?? 0;
        const totalInvoiceAmount = Number(inv.amount || 0);
        const sessionCafePortion = Math.min(totalInvoiceAmount, cafeTotalForSession);
        const devicePortion = Math.max(0, totalInvoiceAmount - sessionCafePortion);
        return acc + devicePortion;
      }, 0);
  };

  // Helper: compute total cafe revenue (session cafe orders in paid invoices + standalone orders) >= boundary
  const calcCafeRevenue = (boundaryZoned: Date) => {
    const sessionCafe = invoices
      .filter((inv: any) => {
        const paymentDate = parseDateUtc(inv.paid_at || inv.issued_at);
        const paymentZoned = toZonedTime(paymentDate, tz);
        return paymentZoned.getTime() >= boundaryZoned.getTime();
      })
      .reduce((acc: number, inv: any) => {
        const cafeTotalForSession = sessionOrdersMap.get(inv.session_id) ?? 0;
        const totalInvoiceAmount = Number(inv.amount || 0);
        const sessionCafePortion = Math.min(totalInvoiceAmount, cafeTotalForSession);
        return acc + sessionCafePortion;
      }, 0);

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

  // Daily breakdown for the chart (last 14 days) including both device invoices & all cafe orders
  const daily: { date: string; total: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = subDays(nowZoned, i);
    const dayStartBoundary = startOfDay(d);
    const dayEndBoundary = addDays(dayStartBoundary, 1);

    // Invoices paid in this calendar day
    const dayInvoices = invoices.filter((inv: any) => {
      const paymentDate = parseDateUtc(inv.paid_at || inv.issued_at);
      const paymentZoned = toZonedTime(paymentDate, tz);
      return paymentZoned.getTime() >= dayStartBoundary.getTime() && paymentZoned.getTime() < dayEndBoundary.getTime();
    });

    const dayInvoiceTotal = dayInvoices.reduce((acc: number, inv: any) => acc + Number(inv.amount || 0), 0);

    // Standalone orders created in this calendar day
    const dayStandaloneCafe = standaloneOrders
      .filter((ord: any) => {
        const createdZoned = toZonedTime(parseDateUtc(ord.created_at), tz);
        return createdZoned.getTime() >= dayStartBoundary.getTime() && createdZoned.getTime() < dayEndBoundary.getTime();
      })
      .reduce((acc: number, ord: any) => acc + Number(ord.total_price || 0), 0);

    const total = dayInvoiceTotal + dayStandaloneCafe;
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
    // Sanitize duration to max 1440 min (24h) to avoid distortion from stale forgotten sessions
    const sanitizedDuration = Math.min(1440, Math.max(0, Number(s.duration_minutes ?? 0)));
    byDevice.set(s.device_id, (byDevice.get(s.device_id) ?? 0) + sanitizedDuration);
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
