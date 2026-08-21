import { Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { notFound, badRequest, conflict, forbidden } from '../lib/errors';
import type { DbShift, DbShiftExpense } from '../lib/types';

/** GET /api/shifts — List shifts with optional filters. */
export async function listShifts(req: Request, res: Response) {
  const { status, user_id } = req.query as { status?: 'active' | 'closed'; user_id?: string };

  let query = supabase
    .from('shifts')
    .select('*, user:users(id, email, full_name)')
    .eq('tenant_id', req.user!.tenant_id)
    .order('started_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }
  // Staff can only see their own shifts unless they are admin
  if (req.user!.role !== 'admin') {
    query = query.eq('user_id', req.user!.id);
  } else if (user_id) {
    query = query.eq('user_id', user_id);
  }

  const { data, error } = await query;
  if (error) throw error;

  res.json({ data: (data ?? []) as unknown as DbShift[] });
}

/** GET /api/shifts/active — Get active shift for current logged-in user. */
export async function getActiveShift(req: Request, res: Response) {
  const { data, error } = await supabase
    .from('shifts')
    .select('*, user:users(id, email, full_name)')
    .eq('user_id', req.user!.id)
    .eq('status', 'active')
    .eq('tenant_id', req.user!.tenant_id)
    .maybeSingle();

  if (error) throw error;

  res.json({ data: data ? (data as unknown as DbShift) : null });
}

/** POST /api/shifts/start — Start a new shift for the current user. */
export async function startShift(req: Request, res: Response) {
  const { opening_cash, notes } = req.body as { opening_cash?: number; notes?: string };

  if (opening_cash === undefined || opening_cash === null || isNaN(Number(opening_cash)) || Number(opening_cash) < 0) {
    throw badRequest('يرجى إدخال قيمة العهدة النقدية الافتتاحية بدقة.', 'OPENING_CASH_REQUIRED');
  }

  // Check if user already has an active shift
  const { data: existingActive } = await supabase
    .from('shifts')
    .select('*, user:users(id, email, full_name)')
    .eq('user_id', req.user!.id)
    .eq('status', 'active')
    .eq('tenant_id', req.user!.tenant_id)
    .maybeSingle();

  if (existingActive) {
    res.json({ data: existingActive as unknown as DbShift, alreadyActive: true });
    return;
  }

  const shiftToInsert = {
    user_id: req.user!.id,
    tenant_id: req.user!.tenant_id,
    started_at: new Date().toISOString(),
    opening_cash: Number(opening_cash),
    closing_cash: null,
    total_revenue: 0,
    total_expenses: 0,
    notes: notes ? notes.trim() : null,
    status: 'active',
  };

  const { data, error } = await supabase
    .from('shifts')
    .insert(shiftToInsert)
    .select('*, user:users(id, email, full_name)')
    .single();

  if (error) throw error;

  res.status(201).json({ data: data as unknown as DbShift });
}

/** POST /api/shifts/:id/close — Close a shift and calculate final cash & metrics. */
export async function closeShift(req: Request, res: Response) {
  const { id } = req.params;
  const { closing_cash, notes } = req.body as { closing_cash?: number; notes?: string };

  if (closing_cash === undefined || closing_cash === null || isNaN(Number(closing_cash)) || Number(closing_cash) < 0) {
    throw badRequest('يجب إدخال المبلغ الفعلي الموجود بالدرج عند إغلاق الوردية.', 'CLOSING_CASH_REQUIRED');
  }

  // Fetch shift
  const { data: shift, error: fetchErr } = await supabase
    .from('shifts')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', req.user!.tenant_id)
    .maybeSingle();

  if (fetchErr) throw fetchErr;
  if (!shift) throw notFound('Shift not found');

  if (req.user!.role !== 'admin' && shift.user_id !== req.user!.id) {
    throw forbidden('You can only close your own shift');
  }

  if (shift.status === 'closed') {
    throw conflict('Shift is already closed');
  }

  // Recalculate accurate total revenue from paid invoices and standalone orders linked to this shift
  const { data: invoices } = await supabase
    .from('invoices')
    .select('amount, paid')
    .eq('shift_id', id)
    .eq('paid', true)
    .eq('tenant_id', req.user!.tenant_id);

  const invoicesRevenue = (invoices || []).reduce((acc: number, inv: any) => acc + Number(inv.amount || 0), 0);

  const { data: standaloneOrders } = await supabase
    .from('standalone_orders')
    .select('total_price')
    .eq('shift_id', id)
    .eq('tenant_id', req.user!.tenant_id);

  const standaloneRevenue = (standaloneOrders || []).reduce((acc: number, ord: any) => acc + Number(ord.total_price || 0), 0);
  const calculatedRevenue = invoicesRevenue + standaloneRevenue;

  // Recalculate accurate total expenses from shift_expenses
  const { data: expenses } = await supabase
    .from('shift_expenses')
    .select('amount')
    .eq('shift_id', id)
    .eq('tenant_id', req.user!.tenant_id);

  const calculatedExpenses = (expenses || []).reduce((acc: number, exp: any) => acc + Number(exp.amount || 0), 0);

  const expectedClosing = Number(shift.opening_cash || 0) + calculatedRevenue - calculatedExpenses;
  const numericClosingCash = Number(closing_cash);
  const cashDifference = numericClosingCash - expectedClosing;

  // If there is any cash difference, require an explanation note for audit integrity
  if (Math.abs(cashDifference) > 0.01 && (!notes || !notes.trim())) {
    throw badRequest(
      cashDifference < 0
        ? `يوجد عجز في الدرج بمقدار ${Math.abs(cashDifference).toFixed(2)} ج. يجب كتابة سبب العجز في خانة الملاحظات قبل الإغلاق.`
        : `يوجد فائض في الدرج بمقدار ${cashDifference.toFixed(2)} ج. يجب كتابة سبب الفائض في خانة الملاحظات قبل الإغلاق.`,
      'DISCREPANCY_NOTE_REQUIRED'
    );
  }

  const patch: Record<string, any> = {
    ended_at: new Date().toISOString(),
    status: 'closed',
    total_revenue: calculatedRevenue,
    total_expenses: calculatedExpenses,
    closing_cash: numericClosingCash,
    notes: notes ? notes.trim() : shift.notes || null,
  };

  const { data, error } = await supabase
    .from('shifts')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', req.user!.tenant_id)
    .select('*, user:users(id, email, full_name)')
    .single();

  if (error) throw error;

  res.json({ data: data as unknown as DbShift });
}

/** GET /api/shifts/:id/summary — Get detailed breakdown and report of a shift. */
export async function getShiftSummary(req: Request, res: Response) {
  const { id } = req.params;

  const { data: shift, error: shiftErr } = await supabase
    .from('shifts')
    .select('*, user:users(id, email, full_name)')
    .eq('id', id)
    .eq('tenant_id', req.user!.tenant_id)
    .maybeSingle();

  if (shiftErr) throw shiftErr;
  if (!shift) throw notFound('Shift not found');

  if (req.user!.role !== 'admin' && shift.user_id !== req.user!.id) {
    throw forbidden('Access denied');
  }

  // Get invoices linked to this shift
  const { data: invoices } = await supabase
    .from('invoices')
    .select(`
      *,
      creator:users(id, full_name, email),
      session:sessions(id, started_at, ended_at, duration_minutes,
        device:devices(id, name, type),
        customer:customers(id, name))
    `)
    .eq('shift_id', id)
    .eq('tenant_id', req.user!.tenant_id)
    .order('issued_at', { ascending: false });

  // Get expenses linked to this shift
  const { data: expenses } = await supabase
    .from('shift_expenses')
    .select('*, creator:users(id, full_name, email)')
    .eq('shift_id', id)
    .eq('tenant_id', req.user!.tenant_id)
    .order('created_at', { ascending: false });

  // Get standalone café sales linked to this shift
  const { data: standaloneOrders } = await supabase
    .from('standalone_orders')
    .select('*, product:products(id, name, price), creator:users(id, full_name, email)')
    .eq('shift_id', id)
    .eq('tenant_id', req.user!.tenant_id)
    .order('created_at', { ascending: false });

  const invoiceList = invoices || [];
  const expenseList = expenses || [];
  const standaloneList = standaloneOrders || [];

  const paidInvoices = invoiceList.filter((inv: any) => inv.paid);
  const paidInvoicesRevenue = paidInvoices.reduce((acc: number, inv: any) => acc + Number(inv.amount || 0), 0);
  const standaloneRevenue = standaloneList.reduce((acc: number, ord: any) => acc + Number(ord.total_price || 0), 0);
  const totalRevenue = paidInvoicesRevenue + standaloneRevenue;
  const totalExpenses = expenseList.reduce((acc: number, exp: any) => acc + Number(exp.amount || 0), 0);
  const openingCash = Number(shift.opening_cash || 0);
  const expectedClosing = openingCash + totalRevenue - totalExpenses;
  const netCash = totalRevenue - totalExpenses;
  const closingCash = shift.closing_cash !== null && shift.closing_cash !== undefined ? Number(shift.closing_cash) : null;
  const cashDifference = closingCash !== null ? closingCash - expectedClosing : null;

  res.json({
    data: {
      shift,
      total_revenue: totalRevenue,
      invoices_revenue: paidInvoicesRevenue,
      standalone_revenue: standaloneRevenue,
      total_expenses: totalExpenses,
      net_cash: netCash,
      opening_cash: openingCash,
      expected_closing: expectedClosing,
      closing_cash: closingCash,
      cash_difference: cashDifference,
      invoice_count: invoiceList.length,
      paid_invoice_count: paidInvoices.length,
      standalone_orders_count: standaloneList.length,
      expense_count: expenseList.length,
      invoices: invoiceList,
      standalone_orders: standaloneList,
      expenses: expenseList,
    },
  });
}

/** GET /api/shifts/expenses — List all expenses across shifts (or by shift_id query). */
export async function listAllExpenses(req: Request, res: Response) {
  const { shift_id, category } = req.query as { shift_id?: string; category?: string };

  let query = supabase
    .from('shift_expenses')
    .select('*, creator:users(id, full_name, email), shift:shifts(id, started_at, ended_at, status, user_id)')
    .eq('tenant_id', req.user!.tenant_id)
    .order('created_at', { ascending: false });

  if (shift_id) {
    query = query.eq('shift_id', shift_id);
  }
  if (category) {
    query = query.eq('category', category);
  }

  const { data, error } = await query;
  if (error) throw error;

  res.json({ data: (data ?? []) as unknown as DbShiftExpense[] });
}

/** GET /api/shifts/:id/expenses — List expenses for a specific shift. */
export async function listShiftExpenses(req: Request, res: Response) {
  const { id } = req.params;

  const { data, error } = await supabase
    .from('shift_expenses')
    .select('*, creator:users(id, full_name, email)')
    .eq('shift_id', id)
    .eq('tenant_id', req.user!.tenant_id)
    .order('created_at', { ascending: false });

  if (error) throw error;

  res.json({ data: (data ?? []) as unknown as DbShiftExpense[] });
}

/** POST /api/shifts/:id/expenses — Create an expense recorded during a shift. */
export async function createShiftExpense(req: Request, res: Response) {
  const { id } = req.params;
  const { amount, category, description } = req.body as {
    amount: number;
    category?: string;
    description: string;
  };

  // Verify shift exists and belongs to tenant
  const { data: shift, error: shiftErr } = await supabase
    .from('shifts')
    .select('id, status, total_expenses')
    .eq('id', id)
    .eq('tenant_id', req.user!.tenant_id)
    .maybeSingle();

  if (shiftErr) throw shiftErr;
  if (!shift) throw notFound('Shift not found');

  const expenseAmount = Number(amount);
  if (isNaN(expenseAmount) || expenseAmount <= 0) {
    throw badRequest('Amount must be a positive number');
  }

  const expenseToInsert = {
    shift_id: id,
    tenant_id: req.user!.tenant_id,
    amount: expenseAmount,
    category: category ? category.trim() : 'عام',
    description: description.trim(),
    created_by: req.user!.id,
    created_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('shift_expenses')
    .insert(expenseToInsert)
    .select('*, creator:users(id, full_name, email)')
    .single();

  if (error) throw error;

  // Update total_expenses in shift
  const newExpensesTotal = Number(shift.total_expenses || 0) + expenseAmount;
  await supabase
    .from('shifts')
    .update({ total_expenses: newExpensesTotal })
    .eq('id', id)
    .eq('tenant_id', req.user!.tenant_id);

  res.status(201).json({ data: data as unknown as DbShiftExpense });
}

/** POST /api/shifts/expenses — Quick-add expense to current user's active shift. */
export async function createQuickExpense(req: Request, res: Response) {
  const { amount, category, description } = req.body as {
    amount: number;
    category?: string;
    description: string;
  };

  // Find active shift
  const { data: activeShift, error: shiftErr } = await supabase
    .from('shifts')
    .select('id, status, total_expenses')
    .eq('user_id', req.user!.id)
    .eq('status', 'active')
    .eq('tenant_id', req.user!.tenant_id)
    .maybeSingle();

  if (shiftErr) throw shiftErr;
  if (!activeShift) {
    throw badRequest('No active shift found. Please start a shift first before recording expenses.');
  }

  const expenseAmount = Number(amount);
  if (isNaN(expenseAmount) || expenseAmount <= 0) {
    throw badRequest('Amount must be a positive number');
  }

  const expenseToInsert = {
    shift_id: activeShift.id,
    tenant_id: req.user!.tenant_id,
    amount: expenseAmount,
    category: category ? category.trim() : 'عام',
    description: description.trim(),
    created_by: req.user!.id,
    created_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('shift_expenses')
    .insert(expenseToInsert)
    .select('*, creator:users(id, full_name, email)')
    .single();

  if (error) throw error;

  // Update total_expenses in shift
  const newExpensesTotal = Number(activeShift.total_expenses || 0) + expenseAmount;
  await supabase
    .from('shifts')
    .update({ total_expenses: newExpensesTotal })
    .eq('id', activeShift.id)
    .eq('tenant_id', req.user!.tenant_id);

  res.status(201).json({ data: data as unknown as DbShiftExpense });
}

/** DELETE /api/shifts/:id/expenses/:expenseId — Delete an expense. */
export async function deleteShiftExpense(req: Request, res: Response) {
  const { id, expenseId } = req.params;

  // Fetch expense
  const { data: expense, error: expErr } = await supabase
    .from('shift_expenses')
    .select('*')
    .eq('id', expenseId)
    .eq('shift_id', id)
    .eq('tenant_id', req.user!.tenant_id)
    .maybeSingle();

  if (expErr) throw expErr;
  if (!expense) throw notFound('Expense not found');

  if (req.user!.role !== 'admin' && expense.created_by !== req.user!.id) {
    throw forbidden('You can only delete your own expenses');
  }

  const { error: delErr } = await supabase
    .from('shift_expenses')
    .delete()
    .eq('id', expenseId)
    .eq('tenant_id', req.user!.tenant_id);

  if (delErr) throw delErr;

  // Recalculate total_expenses on shift
  const { data: remainingExpenses } = await supabase
    .from('shift_expenses')
    .select('amount')
    .eq('shift_id', id)
    .eq('tenant_id', req.user!.tenant_id);

  const updatedTotal = (remainingExpenses || []).reduce((acc: number, exp: any) => acc + Number(exp.amount || 0), 0);

  await supabase
    .from('shifts')
    .update({ total_expenses: updatedTotal })
    .eq('id', id)
    .eq('tenant_id', req.user!.tenant_id);

  res.json({ success: true, message: 'Expense deleted successfully' });
}
