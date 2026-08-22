import { Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { badRequest, forbidden, notFound } from '../lib/errors';

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
  const { name, price, cost_price, stock = 0 } = req.body;
  const initialStock = Math.max(0, Number(stock || 0));

  const { data, error } = await supabase
    .from('products')
    .insert({
      name,
      price: Number(price),
      cost_price: cost_price !== undefined && cost_price !== null ? Number(cost_price) : null,
      stock: initialStock,
      tenant_id: req.user!.tenant_id,
    })
    .select('*')
    .single();

  if (error) {
    console.error('[products] createProduct failed:', error.message, error.code, error.details);
    throw error;
  }

  // Log initial stock creation if stock > 0
  if (initialStock > 0) {
    await supabase.from('product_stock_logs').insert({
      product_id: data.id,
      tenant_id: req.user!.tenant_id,
      actor_id: req.user!.id,
      change_type: 'restock',
      delta: initialStock,
      balance_after: initialStock,
      reason: 'Initial stock set on creation',
    });
  }

  res.status(201).json({ data });
}

/** PATCH /api/products/:id — update a café product. */
export async function updateProduct(req: Request, res: Response) {
  const { id } = req.params;
  const { name, price, cost_price, stock } = req.body;

  // Fetch current product to check stock delta
  const { data: existing, error: fetchErr } = await supabase
    .from('products')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', req.user!.tenant_id)
    .maybeSingle();

  if (fetchErr) throw fetchErr;
  if (!existing) throw notFound('Product not found');

  const patch: Record<string, unknown> = {};
  if (name !== undefined) patch.name = name;
  if (price !== undefined) patch.price = Number(price);
  if (cost_price !== undefined) patch.cost_price = cost_price !== null ? Number(cost_price) : null;

  let newStock: number | null = null;
  if (stock !== undefined) {
    newStock = Math.max(0, Number(stock));
    patch.stock = newStock;
  }

  const { data, error } = await supabase
    .from('products')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', req.user!.tenant_id)
    .select('*')
    .single();

  if (error) throw error;
  if (!data) throw notFound('Product not found');

  // If stock was modified directly, log the manual correction
  if (newStock !== null && newStock !== existing.stock) {
    const delta = newStock - existing.stock;
    await supabase.from('product_stock_logs').insert({
      product_id: id,
      tenant_id: req.user!.tenant_id,
      actor_id: req.user!.id,
      change_type: 'manual_adjustment',
      delta,
      balance_after: newStock,
      reason: 'Manual stock override via product edit',
    });
  }

  res.json({ data });
}

/** POST /api/products/:id/adjust-stock — incremental restock or stock adjustment. */
export async function adjustProductStock(req: Request, res: Response) {
  const { id } = req.params;
  const { delta, reason, category = 'restock' } = req.body;

  const deltaNum = Number(delta);
  if (!deltaNum || isNaN(deltaNum)) {
    throw badRequest('Valid non-zero stock delta required');
  }

  const { data: product, error: fetchErr } = await supabase
    .from('products')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', req.user!.tenant_id)
    .maybeSingle();

  if (fetchErr) throw fetchErr;
  if (!product) throw notFound('Product not found');

  const { data: rpcRows, error: rpcErr } = await supabase.rpc('adjust_product_stock', {
    p_product_id: id,
    p_tenant_id: req.user!.tenant_id,
    p_delta: deltaNum,
  });

  if (rpcErr) throw rpcErr;
  const updatedProduct = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
  if (!updatedProduct) {
    const currentStock = Number(product.stock ?? 0);
    throw badRequest(`Cannot reduce stock below 0. Current stock: ${currentStock}, requested change: ${deltaNum}`);
  }

  const { data: stockLog, error: logErr } = await supabase
    .from('product_stock_logs')
    .insert({
      product_id: id,
      tenant_id: req.user!.tenant_id,
      actor_id: req.user!.id,
      change_type: category,
      delta: deltaNum,
      balance_after: updatedProduct.stock,
      reason: reason || (category === 'restock' ? 'Inventory restock' : 'Stock adjustment'),
    })
    .select('*, actor:users(full_name)')
    .single();

  if (logErr) {
    console.error('[products] Failed to insert stock log:', logErr.message);
  }

  res.json({ data: updatedProduct, log: stockLog });
}

/** GET /api/products/:id/stock-logs — fetch stock adjustment logs for a product. */
export async function getProductStockLogs(req: Request, res: Response) {
  const { id } = req.params;

  const { data: product, error: fetchErr } = await supabase
    .from('products')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', req.user!.tenant_id)
    .maybeSingle();

  if (fetchErr) throw fetchErr;
  if (!product) throw notFound('Product not found');

  const { data: logs, error } = await supabase
    .from('product_stock_logs')
    .select('*, actor:users(full_name)')
    .eq('product_id', id)
    .eq('tenant_id', req.user!.tenant_id)
    .order('created_at', { ascending: false });

  if (error) throw error;
  res.json({ data: logs ?? [] });
}

/** POST /api/products/standalone-sale — walk-in café purchase (not linked to session). */
export async function createStandaloneSale(req: Request, res: Response) {
  const { product_id, quantity, payment_method = 'cash' } = req.body;
  const requestedQty = Number(quantity);

  const { data: product, error: pErr } = await supabase
    .from('products')
    .select('*')
    .eq('id', product_id)
    .eq('tenant_id', req.user!.tenant_id)
    .maybeSingle();

  if (pErr) throw pErr;
  if (!product) throw notFound('Product not found');

  const unitPrice = Number(product.price);
  const costPrice = product.cost_price !== null && product.cost_price !== undefined ? Number(product.cost_price) : null;
  const totalPrice = Math.round(unitPrice * requestedQty * 100) / 100;

  // 1. Decrement stock atomically via RPC
  const { data: rpcRows, error: rpcErr } = await supabase.rpc('decrement_product_stock', {
    p_product_id: product_id,
    p_tenant_id: req.user!.tenant_id,
    p_qty: requestedQty,
  });

  if (rpcErr) throw rpcErr;
  const updatedProduct = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
  if (!updatedProduct) {
    const currentStock = Number(product.stock ?? 0);
    throw badRequest(`Insufficient stock for "${product.name}". Available: ${currentStock}`);
  }

  // 2. Link to active shift if present and update shift total_revenue
  let activeShiftId: string | null = null;
  try {
    let { data: activeShift } = await supabase
      .from('shifts')
      .select('id, total_revenue')
      .eq('user_id', req.user!.id)
      .eq('status', 'active')
      .eq('tenant_id', req.user!.tenant_id)
      .maybeSingle();

    if (!activeShift) {
      const { data: tenantShift } = await supabase
        .from('shifts')
        .select('id, total_revenue')
        .eq('status', 'active')
        .eq('tenant_id', req.user!.tenant_id)
        .order('started_at', { ascending: false })
        .maybeSingle();
      activeShift = tenantShift;
    }

    if (activeShift) {
      activeShiftId = activeShift.id;
      const newRev = Number(activeShift.total_revenue || 0) + totalPrice;
      await supabase
        .from('shifts')
        .update({ total_revenue: newRev })
        .eq('id', activeShift.id)
        .eq('tenant_id', req.user!.tenant_id);
    }
  } catch (shiftErr) {
    console.warn('[products] Could not link active shift to standalone sale:', shiftErr);
  }

  // 3. Insert standalone order
  const { data: order, error: insErr } = await supabase
    .from('standalone_orders')
    .insert({
      tenant_id: req.user!.tenant_id,
      product_id,
      quantity: requestedQty,
      unit_price: unitPrice,
      cost_price: costPrice,
      total_price: totalPrice,
      payment_method,
      shift_id: activeShiftId,
      created_by: req.user!.id,
    })
    .select('*, product:products(id,name,price,stock)')
    .single();

  if (insErr) throw insErr;

  // 3. Log stock decrement
  await supabase.from('product_stock_logs').insert({
    product_id,
    tenant_id: req.user!.tenant_id,
    actor_id: req.user!.id,
    change_type: 'standalone_sale',
    delta: -requestedQty,
    balance_after: updatedProduct.stock,
    reason: `Standalone sale (Walk-in)`,
  });

  res.status(201).json({ data: order });
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

/** GET /api/products/sales-report — get café product sales breakdown and metrics (including cost & profit). */
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

  const salesMap: Record<string, { sold_quantity: number; total_revenue: number }> = {};
  productList.forEach((p: any) => {
    salesMap[p.id] = { sold_quantity: 0, total_revenue: 0 };
  });

  if (productIds.length > 0) {
    // 2a. Fetch session_orders
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

    // 2b. Fetch standalone_orders
    const { data: standalone, error: sErr } = await supabase
      .from('standalone_orders')
      .select('product_id, quantity, total_price')
      .in('product_id', productIds);

    if (!sErr && standalone) {
      standalone.forEach((ord: any) => {
        if (salesMap[ord.product_id]) {
          salesMap[ord.product_id].sold_quantity += Number(ord.quantity || 0);
          salesMap[ord.product_id].total_revenue += Number(ord.total_price || 0);
        }
      });
    }
  }

  let totalRevenue = 0;
  let totalCostSum = 0;
  let totalProfitSum = 0;
  let hasAnyCostData = false;
  let totalItemsSold = 0;
  let topSellingProductName: string | null = null;
  let maxQtySold = -1;
  let outOfStockCount = 0;
  let lowStockCount = 0;

  const items = productList.map((p: any) => {
    const sold = salesMap[p.id]?.sold_quantity || 0;
    const rev = Math.round((salesMap[p.id]?.total_revenue || 0) * 100) / 100;
    const stockNum = Number(p.stock ?? 0);
    const costPriceNum = p.cost_price !== null && p.cost_price !== undefined ? Number(p.cost_price) : null;

    let itemTotalCost: number | null = null;
    let itemProfit: number | null = null;
    let itemMarginPct: number | null = null;

    if (costPriceNum !== null) {
      hasAnyCostData = true;
      itemTotalCost = Math.round(costPriceNum * sold * 100) / 100;
      itemProfit = Math.round((rev - itemTotalCost) * 100) / 100;
      itemMarginPct = rev > 0 ? Math.round((itemProfit / rev) * 1000) / 10 : 0;

      totalCostSum += itemTotalCost;
      totalProfitSum += itemProfit;
    }

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
      cost_price: costPriceNum,
      stock: stockNum,
      sold_quantity: sold,
      total_revenue: rev,
      total_cost: itemTotalCost,
      profit: itemProfit,
      margin_pct: itemMarginPct,
    };
  });

  res.json({
    data: {
      summary: {
        total_revenue: Math.round(totalRevenue * 100) / 100,
        total_cost: hasAnyCostData ? Math.round(totalCostSum * 100) / 100 : null,
        total_profit: hasAnyCostData ? Math.round(totalProfitSum * 100) / 100 : null,
        total_items_sold: totalItemsSold,
        top_selling_product: topSellingProductName,
        out_of_stock_count: outOfStockCount,
        low_stock_count: lowStockCount,
      },
      items,
    },
  });
}
