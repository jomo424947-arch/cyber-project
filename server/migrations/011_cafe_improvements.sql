-- ============================================================================
-- CCMS — 011_cafe_improvements.sql
-- Fixes product uniqueness scoping, adds product cost_price, product_stock_logs,
-- and standalone_orders for walk-in cafe sales.
-- ============================================================================

-- 1. Tenant-scoped product name uniqueness
-- Drop legacy global unique constraint if present
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_name_key;
DROP INDEX IF EXISTS public.products_name_key;

-- Create tenant-scoped unique index on products(tenant_id, name)
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_tenant_name ON public.products(tenant_id, name);

-- 2. Add cost_price to products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cost_price numeric(10,2) CHECK (cost_price >= 0);

-- 3. Stock Logs table
CREATE TABLE IF NOT EXISTS public.product_stock_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  tenant_id     uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  actor_id      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  change_type   text NOT NULL CHECK (change_type IN ('restock', 'sale', 'standalone_sale', 'void_order', 'manual_adjustment', 'shrinkage')),
  delta         integer NOT NULL,
  balance_after integer NOT NULL CHECK (balance_after >= 0),
  reason        text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_logs_product ON public.product_stock_logs(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_logs_tenant  ON public.product_stock_logs(tenant_id);

ALTER TABLE public.product_stock_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read stock logs" ON public.product_stock_logs;
CREATE POLICY "staff read stock logs"
  ON public.product_stock_logs FOR SELECT TO authenticated
  USING ( public.is_staff() );

DROP POLICY IF EXISTS "staff write stock logs" ON public.product_stock_logs;
CREATE POLICY "staff write stock logs"
  ON public.product_stock_logs FOR ALL TO authenticated
  USING ( public.is_staff() )
  WITH CHECK ( public.is_staff() );

-- 4. Standalone Cafe Orders table (walk-in sales)
CREATE TABLE IF NOT EXISTS public.standalone_orders (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id     uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity       integer NOT NULL CHECK (quantity > 0),
  unit_price     numeric(10,2) NOT NULL CHECK (unit_price >= 0),
  cost_price     numeric(10,2) CHECK (cost_price >= 0),
  total_price    numeric(10,2) NOT NULL CHECK (total_price >= 0),
  payment_method text DEFAULT 'cash' CHECK (payment_method IN ('cash','card','transfer','wallet')),
  created_by     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_standalone_orders_tenant  ON public.standalone_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_standalone_orders_product ON public.standalone_orders(product_id);

ALTER TABLE public.standalone_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read standalone_orders" ON public.standalone_orders;
CREATE POLICY "staff read standalone_orders"
  ON public.standalone_orders FOR SELECT TO authenticated
  USING ( public.is_staff() );

DROP POLICY IF EXISTS "staff write standalone_orders" ON public.standalone_orders;
CREATE POLICY "staff write standalone_orders"
  ON public.standalone_orders FOR ALL TO authenticated
  USING ( public.is_staff() )
  WITH CHECK ( public.is_staff() );

-- ============================================================================
-- End of migration 011
-- ============================================================================
