import { Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { notFound } from '../lib/errors';
import { triggerImmediateSync } from '../lib/sync-engine';
import type { DbInvoice } from '../lib/types';

/** GET /api/invoices — list all invoices (optional ?paid=true|false filter). */
export async function listInvoices(req: Request, res: Response) {
  const { paid, shift_id } = req.query as { paid?: string; shift_id?: string };

  let query = supabase
    .from('invoices')
    .select(
      `*,
       creator:users(id, full_name, email),
       session:sessions(id, started_at, ended_at, duration_minutes, device_id,
         device:devices(id, name, type),
         customer:customers(id, name))`
    )
    .eq('tenant_id', req.user!.tenant_id)
    .order('issued_at', { ascending: false });

  if (paid === 'true') query = query.eq('paid', true);
  if (paid === 'false') query = query.eq('paid', false);
  if (shift_id) query = query.eq('shift_id', shift_id);

  const { data, error } = await query;
  if (error) throw error;
  res.json({ data: (data ?? []) as unknown as DbInvoice[] });
}

/** PATCH /api/invoices/:id/pay — mark invoice as paid. */
export async function payInvoice(req: Request, res: Response) {
  const { id } = req.params;
  const { payment_method } = req.body as { payment_method?: string };

  // Fetch existing invoice to check previous status and amount
  const { data: existingInv } = await supabase
    .from('invoices')
    .select('id, amount, paid, shift_id, created_by')
    .eq('id', id)
    .eq('tenant_id', req.user!.tenant_id)
    .maybeSingle();

  if (!existingInv) throw notFound('Invoice not found');

  const patch: Record<string, unknown> = {
    paid: true,
    paid_at: new Date().toISOString(),
  };
  if (payment_method) patch.payment_method = payment_method;

  // If invoice had no shift or creator, we can link it to the payer's active shift or tenant active shift
  if (!existingInv.shift_id) {
    let { data: activeShift } = await supabase
      .from('shifts')
      .select('id')
      .eq('user_id', req.user!.id)
      .eq('status', 'active')
      .eq('tenant_id', req.user!.tenant_id)
      .maybeSingle();

    if (!activeShift) {
      const { data: tenantShift } = await supabase
        .from('shifts')
        .select('id')
        .eq('status', 'active')
        .eq('tenant_id', req.user!.tenant_id)
        .order('started_at', { ascending: false })
        .maybeSingle();
      activeShift = tenantShift;
    }

    if (activeShift) {
      patch.shift_id = activeShift.id;
    }
  }
  if (!existingInv.created_by) {
    patch.created_by = req.user!.id;
  }

  const { data, error } = await supabase
    .from('invoices')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', req.user!.tenant_id)
    .select(
      `*,
       creator:users(id, full_name, email),
       session:sessions(id, started_at, ended_at, duration_minutes, device_id,
         device:devices(id, name, type),
         customer:customers(id, name))`
    )
    .maybeSingle();

  if (error) throw error;
  if (!data) throw notFound('Invoice not found');

  // If newly paid, update shift revenue
  if (!existingInv.paid && Number(data.amount) > 0) {
    const targetShiftId = (patch.shift_id as string) || existingInv.shift_id;
    if (targetShiftId) {
      try {
        const { data: shiftRow } = await supabase
          .from('shifts')
          .select('id, total_revenue')
          .eq('id', targetShiftId)
          .maybeSingle();

        if (shiftRow) {
          const updatedRev = Number(shiftRow.total_revenue || 0) + Number(data.amount);
          await supabase
            .from('shifts')
            .update({ total_revenue: updatedRev })
            .eq('id', targetShiftId);
        }
      } catch (err) {
        console.warn('[billing] Failed to update shift revenue on pay:', err);
      }
    }
  }

  res.json({ data: data as unknown as DbInvoice });
  triggerImmediateSync();
}

