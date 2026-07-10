import { Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { notFound } from '../lib/errors';
import type { DbInvoice } from '../lib/types';

/** GET /api/invoices — list all invoices (optional ?paid=true|false filter). */
export async function listInvoices(req: Request, res: Response) {
  const { paid } = req.query as { paid?: string };

  let query = supabase
    .from('invoices')
    .select(
      `*,
       session:sessions(id, started_at, ended_at, duration_minutes, device_id,
         device:devices(id, name, type),
         customer:customers(id, name))`
    )
    .order('issued_at', { ascending: false });

  if (paid === 'true') query = query.eq('paid', true);
  if (paid === 'false') query = query.eq('paid', false);

  const { data, error } = await query;
  if (error) throw error;
  res.json({ data: (data ?? []) as unknown as DbInvoice[] });
}

/** PATCH /api/invoices/:id/pay — mark invoice as paid. */
export async function payInvoice(req: Request, res: Response) {
  const { id } = req.params;
  const { payment_method } = req.body as { payment_method?: string };

  const patch: Record<string, unknown> = {
    paid: true,
    paid_at: new Date().toISOString(),
  };
  if (payment_method) patch.payment_method = payment_method;

  const { data, error } = await supabase
    .from('invoices')
    .update(patch)
    .eq('id', id)
    .select(
      `*,
       session:sessions(id, started_at, ended_at, duration_minutes, device_id,
         device:devices(id, name, type),
         customer:customers(id, name))`
    )
    .maybeSingle();

  if (error) throw error;
  if (!data) throw notFound('Invoice not found');
  res.json({ data: data as unknown as DbInvoice });
}
