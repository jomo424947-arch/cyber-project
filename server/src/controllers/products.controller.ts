import { Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { forbidden, notFound } from '../lib/errors';

/** GET /api/products — list all café products. */
export async function listProducts(req: Request, res: Response) {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('tenant_id', req.user!.tenant_id)
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
  const { name, price, stock = 0 } = req.body;

  const { data, error } = await supabase
    .from('products')
    .insert({ name, price, stock: Number(stock), tenant_id: req.user!.tenant_id })
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
  const { name, price, stock } = req.body;

  const patch: Record<string, unknown> = {};
  if (name !== undefined) patch.name = name;
  if (price !== undefined) patch.price = price;
  if (stock !== undefined) patch.stock = Number(stock);

  const { data, error } = await supabase
    .from('products')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', req.user!.tenant_id)
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
    .eq('id', id)
    .eq('tenant_id', req.user!.tenant_id);

  if (error) throw error;
  res.json({ success: true });
}

/** GET /api/products/sales-report — get café product sales breakdown and metrics. */
export async function getProductSalesReport(req: Request, res: Response) {
  // 1. Fetch products for current tenant
  const { data: products, error: pErr } = await supabase
    .from('products')
    .select('*')
    .eq('tenant_id', req.user!.tenant_id)
    .order('name', { ascending: true });

  if (pErr) throw pErr;

  const productList = products ?? [];
  const productIds = productList.map((p: any) => p.id);

  // Map to store aggregations per product_id
  const salesMap: Record<string, { sold_quantity: number; total_revenue: number }> = {};
  productList.forEach((p: any) => {
    salesMap[p.id] = { sold_quantity: 0, total_revenue: 0 };
  });

  if (productIds.length > 0) {
    // 2. Fetch session_orders matching productIds
    const { data: orders, error: oErr } = await supabase
      .from('session_orders')
      .select('product_id, quantity, total_price')
      .in('product_id', productIds);

    if (!oErr && orders) {
      orders.forEach((ord: any) => {
        if (salesMap[ord.product_id]) {
          salesMap[ord.product_id].sold_quantity += Number(ord.quantity || 0);
          salesMap[ord.product_id].total_revenue += Number(ord.total_price || 0);
        }
      });
    }
  }

  let totalRevenue = 0;
  let totalItemsSold = 0;
  let topSellingProductName: string | null = null;
  let maxQtySold = -1;
  let outOfStockCount = 0;
  let lowStockCount = 0;

  const items = productList.map((p: any) => {
    const sold = salesMap[p.id]?.sold_quantity || 0;
    const rev = Math.round((salesMap[p.id]?.total_revenue || 0) * 100) / 100;
    const stockNum = Number(p.stock ?? 0);

    totalRevenue += rev;
    totalItemsSold += sold;

    if (stockNum === 0) {
      outOfStockCount++;
    } else if (stockNum <= 5) {
      lowStockCount++;
    }

    if (sold > maxQtySold && sold > 0) {
      maxQtySold = sold;
      topSellingProductName = p.name;
    }

    return {
      id: p.id,
      name: p.name,
      price: Number(p.price),
      stock: stockNum,
      sold_quantity: sold,
      total_revenue: rev,
    };
  });

  res.json({
    data: {
      summary: {
        total_revenue: Math.round(totalRevenue * 100) / 100,
        total_items_sold: totalItemsSold,
        top_selling_product: topSellingProductName,
        out_of_stock_count: outOfStockCount,
        low_stock_count: lowStockCount,
      },
      items,
    },
  });
}

