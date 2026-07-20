-- ============================================================================
-- CCMS — 006_cafe_support.sql
-- Adds `products` table and `session_orders` table to track café sales linked
-- to active gaming sessions.
-- ============================================================================

-- 1. products table
CREATE TABLE IF NOT EXISTS public.products (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  price       numeric(10,2) NOT NULL CHECK (price >= 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Seed default café items
INSERT INTO public.products (name, price)
VALUES
  ('Pepsi Cola', 2.00),
  ('Coca Cola', 2.00),
  ('Fury Energy Drink', 3.50),
  ('Chipsy (Salt & Vinegar)', 1.50),
  ('Sprite', 2.00),
  ('Mineral Water', 1.00),
  ('Hot Tea', 1.50),
  ('Turkish Coffee', 2.50)
ON CONFLICT (name) DO UPDATE SET price = EXCLUDED.price;

-- 2. session_orders table
CREATE TABLE IF NOT EXISTS public.session_orders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  product_id  uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity    integer NOT NULL CHECK (quantity > 0),
  unit_price  numeric(10,2) NOT NULL CHECK (unit_price >= 0),
  total_price numeric(10,2) NOT NULL CHECK (total_price >= 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_session_orders_session ON public.session_orders(session_id);

-- 3. Row Level Security (RLS)
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_orders ENABLE ROW LEVEL SECURITY;

-- Products Policies
DROP POLICY IF EXISTS "staff read products" ON public.products;
CREATE POLICY "staff read products"
  ON public.products FOR SELECT TO authenticated
  USING ( public.is_staff() );

DROP POLICY IF EXISTS "admin write products" ON public.products;
CREATE POLICY "admin write products"
  ON public.products FOR ALL TO authenticated
  USING ( public.is_admin() )
  WITH CHECK ( public.is_admin() );

-- Session Orders Policies
DROP POLICY IF EXISTS "staff read session_orders" ON public.session_orders;
CREATE POLICY "staff read session_orders"
  ON public.session_orders FOR SELECT TO authenticated
  USING ( public.is_staff() );

DROP POLICY IF EXISTS "staff write session_orders" ON public.session_orders;
CREATE POLICY "staff write session_orders"
  ON public.session_orders FOR ALL TO authenticated
  USING ( public.is_staff() )
  WITH CHECK ( public.is_staff() );

-- ============================================================================
-- End of migration 006
-- ============================================================================
