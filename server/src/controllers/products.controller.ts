import { Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { forbidden, notFound } from '../lib/errors';

/** GET /api/products — list all café products. */
export async function listProducts(req: Request, res: Response) {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    if (error.code === 'PGRST205') {
      res.json({ data: [] });
      return;
    }
    throw error;
  }
  res.json({ data: data ?? [] });
}

/** POST /api/products — add a new café product. */
export async function createProduct(req: Request, res: Response) {
  const { name, price } = req.body;

  const { data, error } = await supabase
    .from('products')
    .insert({ name, price })
    .select('*')
    .single();

  if (error) {
    console.error('[products] createProduct failed:', error.message, error.code, error.details);
    throw error;
  }
  res.status(201).json({ data });
}

/** PATCH /api/products/:id — update a café product. */
export async function updateProduct(req: Request, res: Response) {
  const { id } = req.params;
  const { name, price } = req.body;

  const patch: Record<string, unknown> = {};
  if (name !== undefined) patch.name = name;
  if (price !== undefined) patch.price = price;

  const { data, error } = await supabase
    .from('products')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  if (!data) throw notFound('Product not found');
  res.json({ data });
}

/** DELETE /api/products/:id — remove a café product. */
export async function deleteProduct(req: Request, res: Response) {
  const { id } = req.params;

  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', id);

  if (error) throw error;
  res.json({ success: true });
}
