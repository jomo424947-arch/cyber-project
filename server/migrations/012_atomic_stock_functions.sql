-- ============================================================================
-- CCMS — 012_atomic_stock_functions.sql
-- Atomic, race-safe stock adjustment functions to prevent overselling under
-- concurrent requests (see production audit finding C2).
-- ============================================================================

-- Atomically decrement stock. Returns the updated row if successful, or no
-- rows if there was insufficient stock (caller must check for empty result).
create or replace function public.decrement_product_stock(
  p_product_id uuid,
  p_tenant_id uuid,
  p_qty integer
)
returns setof public.products
language sql
as $$
  update public.products
  set stock = stock - p_qty
  where id = p_product_id
    and tenant_id = p_tenant_id
    and stock >= p_qty
  returning *;
$$;

-- Atomically apply any signed delta (positive = restock/void-restore,
-- negative = sale/shrinkage) while still guarding against going below zero.
create or replace function public.adjust_product_stock(
  p_product_id uuid,
  p_tenant_id uuid,
  p_delta integer
)
returns setof public.products
language sql
as $$
  update public.products
  set stock = stock + p_delta
  where id = p_product_id
    and tenant_id = p_tenant_id
    and stock + p_delta >= 0
  returning *;
$$;

-- ============================================================================
-- End of migration 012
-- ============================================================================
