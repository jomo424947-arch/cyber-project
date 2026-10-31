import { Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { toZonedTime, format } from 'date-fns-tz';
import {
  startOfMonth,
  endOfMonth,
  subMonths,
  eachDayOfInterval,
  isSameDay,
  getDaysInMonth,
} from 'date-fns';
import { badRequest, notFound } from '../lib/errors';
import crypto from 'crypto';

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
 * Helper to compute month boundaries in the local reporting timezone.
 */
function getMonthBoundaries(year: number, month: number, tz: string) {
  // Construct UTC date for 1st of month at midnight UTC
  const padMonth = String(month).padStart(2, '0');
  const startIso = `${year}-${padMonth}-01T00:00:00.000Z`;
  const startDate = new Date(startIso);

  // Next month boundary
  let nextYear = year;
  let nextMonth = month + 1;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }
  const padNextMonth = String(nextMonth).padStart(2, '0');
  const endIso = `${nextYear}-${padNextMonth}-01T00:00:00.000Z`;
  const endDate = new Date(endIso);

  return { startIso, endIso, startDate, endDate };
}

/**
 * GET /api/financial-closings
 * Returns a list of all historical and current months with their closing status and quick figures.
 */
export async function listMonths(req: Request, res: Response) {
  const tenantId = req.user!.tenant_id;
  const tz = process.env.REPORT_TIMEZONE || 'Africa/Cairo';
  const now = toZonedTime(new Date(), tz);
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // 1. Fetch all closed records from monthly_closings
  const { data: closings, error: closingsErr } = await supabase
    .from('monthly_closings')
    .select('*, closer:users(id, full_name, email)')
    .eq('tenant_id', tenantId)
    .order('year', { ascending: false })
    .order('month', { ascending: false });

  if (closingsErr) {
    console.error('[monthly-closings] error loading closings:', closingsErr);
  }

  const closingsMap = new Map<string, any>();
  for (const c of closings || []) {
    closingsMap.set(`${c.year}-${c.month}`, c);
  }

  // 2. Discover months from invoices & expenses to make sure all active months appear
  const periods = new Set<string>();
  // Include current month and last 12 months by default
  for (let i = 0; i < 12; i++) {
    const d = subMonths(now, i);
    periods.add(`${d.getFullYear()}-${d.getMonth() + 1}`);
  }

  // Add all months that have a closing record
  for (const c of closings || []) {
    periods.add(`${c.year}-${c.month}`);
  }

  // Sort periods descending (newest first)
  const sortedPeriods = Array.from(periods).sort((a, b) => {
    const [yA, mA] = a.split('-').map(Number);
    const [yB, mB] = b.split('-').map(Number);
    if (yA !== yB) return yB - yA;
    return mB - mA;
  });

  const list = sortedPeriods.map((p) => {
    const [y, m] = p.split('-').map(Number);
    const closing = closingsMap.get(p);
    return {
      year: y,
      month: m,
      period_key: p,
      is_current: y === currentYear && m === currentMonth,
      status: closing?.status || 'open',
      total_revenue: closing ? Number(closing.total_revenue || 0) : null,
      total_expenses: closing ? Number(closing.total_expenses || 0) : null,
      net_profit: closing ? Number(closing.net_profit || 0) : null,
      closed_at: closing?.closed_at || null,
      closer_name: closing?.closer?.full_name || null,
    };
  });

  res.json({ data: list });
}

/**
 * GET /api/financial-closings/:year/:month
 * Returns detailed financial statement and breakdown for a given month.
 */
export async function getMonthDetails(req: Request, res: Response) {
  const tenantId = req.user!.tenant_id;
  const year = parseInt(req.params.year, 10);
  const month = parseInt(req.params.month, 10);

  if (isNaN(year) || year < 2020 || year > 2100) {
    throw badRequest('Invalid year');
  }
  if (isNaN(month) || month < 1 || month > 12) {
    throw badRequest('Invalid month (must be 1-12)');
  }

  const tz = process.env.REPORT_TIMEZONE || 'Africa/Cairo';
  const { startIso, endIso, startDate } = getMonthBoundaries(year, month, tz);

  // Fetch closing record if it exists
  const { data: closingRecord } = await supabase
    .from('monthly_closings')
    .select('*, closer:users(id, full_name, email)')
    .eq('tenant_id', tenantId)
    .eq('year', year)
    .eq('month', month)
    .maybeSingle();

  // 1. Fetch paid invoices for this month
  const invoicesRes = await supabase
    .from('invoices')
    .select('id, session_id, amount, subtotal, discount_amount, service_fee, paid, paid_at, issued_at')
    .eq('tenant_id', tenantId)
    .eq('paid', true)
    .or(`paid_at.gte.${startIso},issued_at.gte.${startIso}`)
    .order('paid_at', { ascending: true });

  if (invoicesRes.error) throw invoicesRes.error;

  const allInvoices = invoicesRes.data || [];
  // Filter invoices belonging to this exact month window
  const invoices = allInvoices.filter((inv: any) => {
    const pDate = parseDateUtc(inv.paid_at || inv.issued_at);
    return pDate >= new Date(startIso) && pDate < new Date(endIso);
  });

  const sessionIds = invoices.map((inv: any) => inv.session_id).filter(Boolean);

  // 2. Fetch session_orders (for invoiced sessions) & standalone orders
  const [sessionOrdersRes, standaloneOrdersRes, expensesRes, shiftsRes] = await Promise.all([
    sessionIds.length > 0
      ? supabase
          .from('session_orders')
          .select('id, session_id, total_price, created_at')
          .in('session_id', sessionIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('standalone_orders')
      .select('id, product_id, total_price, created_at')
      .eq('tenant_id', tenantId)
      .gte('created_at', startIso)
      .lt('created_at', endIso),
    supabase
      .from('shift_expenses')
      .select('*, creator:users(id, full_name, email)')
      .eq('tenant_id', tenantId)
      .gte('created_at', startIso)
      .lt('created_at', endIso)
      .order('created_at', { ascending: true }),
    supabase
      .from('shifts')
      .select('*, user:users(id, full_name, email)')
      .eq('tenant_id', tenantId)
      .gte('started_at', startIso)
      .lt('started_at', endIso)
      .order('started_at', { ascending: false }),
  ]);

  const sessionOrders = sessionOrdersRes.data || [];
  const standaloneOrders = standaloneOrdersRes.data || [];
  const expenses = expensesRes.data || [];
  const shifts = shiftsRes.data || [];

  // Map session orders total per session
  const sessionOrdersMap = new Map<string, number>();
  for (const ord of sessionOrders) {
    if (ord.session_id) {
      sessionOrdersMap.set(
        ord.session_id,
        (sessionOrdersMap.get(ord.session_id) ?? 0) + Number(ord.total_price || 0)
      );
    }
  }

  // Calculate Device Revenue & Cafe Revenue
  let deviceRevenue = 0;
  let sessionCafeRevenue = 0;

  for (const inv of invoices) {
    const cafeTotalForSession = sessionOrdersMap.get(inv.session_id) ?? 0;
    const totalInvoiceAmount = Number(inv.amount || 0);
    const cafePortion = Math.min(totalInvoiceAmount, cafeTotalForSession);
    const devPortion = Math.max(0, totalInvoiceAmount - cafePortion);

    deviceRevenue += devPortion;
    sessionCafeRevenue += cafePortion;
  }

  const standaloneCafeRevenue = standaloneOrders.reduce(
    (acc: number, ord: any) => acc + Number(ord.total_price || 0),
    0
  );
  const cafeRevenue = sessionCafeRevenue + standaloneCafeRevenue;
  const totalRevenue = Number((deviceRevenue + cafeRevenue).toFixed(2));

  // Calculate Expenses
  const totalExpenses = Number(
    expenses.reduce((acc: number, exp: any) => acc + Number(exp.amount || 0), 0).toFixed(2)
  );
  const netProfit = Number((totalRevenue - totalExpenses).toFixed(2));
  const profitMarginPct =
    totalRevenue > 0 ? Number(((netProfit / totalRevenue) * 100).toFixed(1)) : 0;

  // Expenses grouped by category
  const categoryMap = new Map<string, { count: number; total: number }>();
  for (const exp of expenses) {
    const cat = (exp.category || '').trim() || 'عام / أخرى';
    const curr = categoryMap.get(cat) || { count: 0, total: 0 };
    curr.count += 1;
    curr.total += Number(exp.amount || 0);
    categoryMap.set(cat, curr);
  }

  const expensesByCategory = Array.from(categoryMap.entries()).map(([cat, val]) => ({
    category: cat,
    total: Number(val.total.toFixed(2)),
    count: val.count,
    percentage:
      totalExpenses > 0 ? Number(((val.total / totalExpenses) * 100).toFixed(1)) : 0,
  })).sort((a, b) => b.total - a.total);

  // Shifts calculations: count and cash discrepancy (عجز أو زيادة الكاش)
  const shiftsCount = shifts.length;
  let totalCashDiscrepancy = 0;
  for (const s of shifts) {
    if (s.closing_cash !== null && s.closing_cash !== undefined) {
      const expected = Number(s.opening_cash || 0) + Number(s.total_revenue || 0) - Number(s.total_expenses || 0);
      const diff = Number(s.closing_cash) - expected;
      totalCashDiscrepancy += diff;
    }
  }

  // Daily Ledger Breakdown (day 1 to last day of month)
  const daysCount = getDaysInMonth(new Date(year, month - 1, 1));
  const dailyLedger = [];

  for (let d = 1; d <= daysCount; d++) {
    const dayDate = new Date(Date.UTC(year, month - 1, d, 0, 0, 0));
    const nextDayDate = new Date(Date.UTC(year, month - 1, d + 1, 0, 0, 0));
    const dayStartIso = dayDate.toISOString();
    const dayEndIso = nextDayDate.toISOString();

    // Day invoices
    const dayInvoices = invoices.filter((inv: any) => {
      const p = parseDateUtc(inv.paid_at || inv.issued_at);
      return p >= dayDate && p < nextDayDate;
    });

    let dayDevRev = 0;
    let daySessCafe = 0;
    for (const inv of dayInvoices) {
      const cTot = sessionOrdersMap.get(inv.session_id) ?? 0;
      const invAmt = Number(inv.amount || 0);
      const cPortion = Math.min(invAmt, cTot);
      dayDevRev += Math.max(0, invAmt - cPortion);
      daySessCafe += cPortion;
    }

    const dayStandaloneCafe = standaloneOrders
      .filter((ord: any) => {
        const p = parseDateUtc(ord.created_at);
        return p >= dayDate && p < nextDayDate;
      })
      .reduce((sum: number, ord: any) => sum + Number(ord.total_price || 0), 0);

    const dayCafeRev = daySessCafe + dayStandaloneCafe;
    const dayTotRev = Number((dayDevRev + dayCafeRev).toFixed(2));

    const dayExp = Number(
      expenses
        .filter((exp: any) => {
          const p = parseDateUtc(exp.created_at);
          return p >= dayDate && p < nextDayDate;
        })
        .reduce((sum: number, exp: any) => sum + Number(exp.amount || 0), 0)
        .toFixed(2)
    );

    const dayShifts = shifts.filter((s: any) => {
      const p = parseDateUtc(s.started_at);
      return p >= dayDate && p < nextDayDate;
    }).length;

    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

    dailyLedger.push({
      day: d,
      date: dateStr,
      device_revenue: Number(dayDevRev.toFixed(2)),
      cafe_revenue: Number(dayCafeRev.toFixed(2)),
      total_revenue: dayTotRev,
      total_expenses: dayExp,
      net_profit: Number((dayTotRev - dayExp).toFixed(2)),
      shifts_count: dayShifts,
    });
  }

  // Previous month comparison
  let prevYear = year;
  let prevMonth = month - 1;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear -= 1;
  }
  const prevBoundaries = getMonthBoundaries(prevYear, prevMonth, tz);

  const [prevInvoicesRes, prevExpensesRes] = await Promise.all([
    supabase
      .from('invoices')
      .select('amount')
      .eq('tenant_id', tenantId)
      .eq('paid', true)
      .gte('paid_at', prevBoundaries.startIso)
      .lt('paid_at', prevBoundaries.endIso),
    supabase
      .from('shift_expenses')
      .select('amount')
      .eq('tenant_id', tenantId)
      .gte('created_at', prevBoundaries.startIso)
      .lt('created_at', prevBoundaries.endIso),
  ]);

  const prevRevenue = Number(
    (prevInvoicesRes.data || []).reduce((s: number, i: any) => s + Number(i.amount || 0), 0).toFixed(2)
  );
  const prevExpenses = Number(
    (prevExpensesRes.data || []).reduce((s: number, e: any) => s + Number(e.amount || 0), 0).toFixed(2)
  );
  const prevProfit = Number((prevRevenue - prevExpenses).toFixed(2));

  const revenueGrowthPct =
    prevRevenue > 0 ? Number((((totalRevenue - prevRevenue) / prevRevenue) * 100).toFixed(1)) : 0;
  const profitGrowthPct =
    prevProfit > 0 ? Number((((netProfit - prevProfit) / prevProfit) * 100).toFixed(1)) : 0;

  res.json({
    data: {
      period: {
        year,
        month,
        days_in_month: daysCount,
        start_date: startIso,
        end_date: endIso,
      },
      closing: closingRecord || {
        status: 'open',
        closed_at: null,
        closed_by: null,
        closing_notes: null,
        closing_balance: 0,
      },
      totals: {
        total_revenue: totalRevenue,
        device_revenue: Number(deviceRevenue.toFixed(2)),
        cafe_revenue: Number(cafeRevenue.toFixed(2)),
        total_expenses: totalExpenses,
        net_profit: netProfit,
        profit_margin_pct: profitMarginPct,
        shifts_count: shiftsCount,
        cash_discrepancy: Number(totalCashDiscrepancy.toFixed(2)),
        invoices_count: invoices.length,
        expenses_count: expenses.length,
      },
      expenses_by_category: expensesByCategory,
      expenses_list: expenses.slice(0, 100),
      shifts_list: shifts,
      comparison_previous_month: {
        prev_year: prevYear,
        prev_month: prevMonth,
        prev_revenue: prevRevenue,
        prev_expenses: prevExpenses,
        prev_profit: prevProfit,
        revenue_growth_pct: revenueGrowthPct,
        profit_growth_pct: profitGrowthPct,
      },
      daily_ledger: dailyLedger,
    },
  });
}

/**
 * POST /api/financial-closings/:year/:month/close
 * Officially finalize and lock the financial month. Admin only.
 */
export async function closeMonth(req: Request, res: Response) {
  const tenantId = req.user!.tenant_id;
  const year = parseInt(req.params.year, 10);
  const month = parseInt(req.params.month, 10);
  const { closing_notes, closing_balance } = req.body || {};

  if (isNaN(year) || isNaN(month)) {
    throw badRequest('Valid year and month required');
  }

  const tz = process.env.REPORT_TIMEZONE || 'Africa/Cairo';
  const { startIso, endIso } = getMonthBoundaries(year, month, tz);

  // Calculate snapshot of financials
  const [invoicesRes, standaloneRes, expensesRes, shiftsRes] = await Promise.all([
    supabase
      .from('invoices')
      .select('amount, session_id')
      .eq('tenant_id', tenantId)
      .eq('paid', true)
      .gte('paid_at', startIso)
      .lt('paid_at', endIso),
    supabase
      .from('standalone_orders')
      .select('total_price')
      .eq('tenant_id', tenantId)
      .gte('created_at', startIso)
      .lt('created_at', endIso),
    supabase
      .from('shift_expenses')
      .select('amount')
      .eq('tenant_id', tenantId)
      .gte('created_at', startIso)
      .lt('created_at', endIso),
    supabase
      .from('shifts')
      .select('opening_cash, closing_cash, total_revenue, total_expenses')
      .eq('tenant_id', tenantId)
      .gte('started_at', startIso)
      .lt('started_at', endIso),
  ]);

  const invoices = invoicesRes.data || [];
  const standaloneOrders = standaloneRes.data || [];
  const expenses = expensesRes.data || [];
  const shifts = shiftsRes.data || [];

  const invoiceRev = invoices.reduce((s: number, i: any) => s + Number(i.amount || 0), 0);
  const standaloneRev = standaloneOrders.reduce((s: number, o: any) => s + Number(o.total_price || 0), 0);
  const totalRev = Number((invoiceRev + standaloneRev).toFixed(2));
  const totalExp = Number(expenses.reduce((s: number, e: any) => s + Number(e.amount || 0), 0).toFixed(2));
  const netProf = Number((totalRev - totalExp).toFixed(2));

  let discrepancy = 0;
  for (const s of shifts) {
    if (s.closing_cash !== null && s.closing_cash !== undefined) {
      const exp = Number(s.opening_cash || 0) + Number(s.total_revenue || 0) - Number(s.total_expenses || 0);
      discrepancy += Number(s.closing_cash) - exp;
    }
  }

  const nowIso = new Date().toISOString();

  // Check if closing record already exists
  const { data: existing } = await supabase
    .from('monthly_closings')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('year', year)
    .eq('month', month)
    .maybeSingle();

  let result;
  if (existing?.id) {
    result = await supabase
      .from('monthly_closings')
      .update({
        status: 'closed',
        total_revenue: totalRev,
        total_expenses: totalExp,
        net_profit: netProf,
        shifts_count: shifts.length,
        cash_discrepancy: Number(discrepancy.toFixed(2)),
        closing_balance: Number(closing_balance || 0),
        closing_notes: closing_notes ? String(closing_notes).trim() : null,
        closed_by: req.user!.id,
        closed_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', existing.id)
      .select('*, closer:users(id, full_name, email)')
      .single();
  } else {
    result = await supabase
      .from('monthly_closings')
      .insert({
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        year,
        month,
        status: 'closed',
        total_revenue: totalRev,
        device_revenue: invoiceRev,
        cafe_revenue: standaloneRev,
        total_expenses: totalExp,
        net_profit: netProf,
        shifts_count: shifts.length,
        cash_discrepancy: Number(discrepancy.toFixed(2)),
        closing_balance: Number(closing_balance || 0),
        closing_notes: closing_notes ? String(closing_notes).trim() : null,
        closed_by: req.user!.id,
        closed_at: nowIso,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select('*, closer:users(id, full_name, email)')
      .single();
  }

  if (result.error) throw result.error;

  res.json({
    message: 'Month successfully closed and finalized',
    data: result.data,
  });
}

/**
 * POST /api/financial-closings/:year/:month/reopen
 * Reopen a previously closed month. Admin only.
 */
export async function reopenMonth(req: Request, res: Response) {
  const tenantId = req.user!.tenant_id;
  const year = parseInt(req.params.year, 10);
  const month = parseInt(req.params.month, 10);
  const { reason } = req.body || {};

  const { data: existing } = await supabase
    .from('monthly_closings')
    .select('id, status, closing_notes')
    .eq('tenant_id', tenantId)
    .eq('year', year)
    .eq('month', month)
    .maybeSingle();

  if (!existing) {
    throw notFound('No closing record found for this period');
  }

  const updatedNotes = reason
    ? `${existing.closing_notes || ''}\n[Reopened on ${new Date().toLocaleDateString('ar-EG')}: ${reason}]`.trim()
    : existing.closing_notes;

  const { data, error } = await supabase
    .from('monthly_closings')
    .update({
      status: 'open',
      closing_notes: updatedNotes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id)
    .select('*, closer:users(id, full_name, email)')
    .single();

  if (error) throw error;

  res.json({
    message: 'Month reopened successfully',
    data,
  });
}

