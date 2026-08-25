-- ============================================================================
-- CCMS — 015_rls_tenant_isolation.sql (Self-Healing & Complete)
-- SECURITY FIX: Enforces per-tenant isolation on ALL tables & creates missing tables.
--
-- Can be run safely on ANY Supabase state (fresh or existing).
-- ============================================================================

-- ─── 0. Extensions & Helper Functions ─────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Generic updated_at trigger function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  new.updated_at = now();
  RETURN new;
END;
$$;

-- Helper: is the current user an admin?
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Helper: is the current user authenticated staff/admin?
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid()
  );
$$;

-- Helper: retrieve the current user's tenant_id
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT tenant_id FROM public.users WHERE id = auth.uid();
$$;

-- ─── 1. tenants ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tenants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  owner_email text NOT NULL UNIQUE,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'trial')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant owner access" ON public.tenants;
CREATE POLICY "tenant owner access"
  ON public.tenants FOR SELECT TO authenticated
  USING ( id = public.current_tenant_id() OR public.is_admin() );

-- ─── 2. users ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text NOT NULL UNIQUE,
  full_name   text,
  role        text NOT NULL DEFAULT 'staff' CHECK (role IN ('admin','staff')),
  tenant_id   uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read self or admin reads all"    ON public.users;
DROP POLICY IF EXISTS "users update self or admin updates all" ON public.users;
DROP POLICY IF EXISTS "only admin deletes users"              ON public.users;
DROP POLICY IF EXISTS "users read same tenant"                ON public.users;
DROP POLICY IF EXISTS "users update same tenant"              ON public.users;
DROP POLICY IF EXISTS "only admin deletes users in own tenant" ON public.users;

CREATE POLICY "users read same tenant"
  ON public.users FOR SELECT TO authenticated
  USING (
    auth.uid() = id
    OR (
      public.is_admin()
      AND tenant_id = public.current_tenant_id()
    )
  );

CREATE POLICY "users update same tenant"
  ON public.users FOR UPDATE TO authenticated
  USING (
    auth.uid() = id
    OR (
      public.is_admin()
      AND tenant_id = public.current_tenant_id()
    )
  );

CREATE POLICY "only admin deletes users in own tenant"
  ON public.users FOR DELETE TO authenticated
  USING (
    public.is_admin()
    AND tenant_id = public.current_tenant_id()
  );

-- ─── 3. devices ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.devices (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  type              text NOT NULL DEFAULT 'pc' CHECK (type IN ('pc','console','vr','table')),
  status            text NOT NULL DEFAULT 'available' CHECK (status IN ('available','in_use','reserved','offline')),
  specs             jsonb,
  hourly_rate       numeric(10,2) NOT NULL DEFAULT 0 CHECK (hourly_rate >= 0),
  hourly_rate_multi numeric(10,2) NOT NULL DEFAULT 0 CHECK (hourly_rate_multi >= 0),
  archived          boolean NOT NULL DEFAULT false,
  tenant_id         uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS hourly_rate_multi numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read devices"  ON public.devices;
DROP POLICY IF EXISTS "admin write devices" ON public.devices;

CREATE POLICY "staff read devices"
  ON public.devices FOR SELECT TO authenticated
  USING (
    public.is_staff()
    AND tenant_id = public.current_tenant_id()
  );

CREATE POLICY "admin write devices"
  ON public.devices FOR ALL TO authenticated
  USING (
    public.is_admin()
    AND tenant_id = public.current_tenant_id()
  )
  WITH CHECK (
    public.is_admin()
    AND tenant_id = public.current_tenant_id()
  );

-- ─── 4. customers ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customers (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username   text NOT NULL UNIQUE,
  name       text NOT NULL,
  phone      text,
  email      text,
  tenant_id  uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read customers"  ON public.customers;
DROP POLICY IF EXISTS "staff write customers" ON public.customers;

CREATE POLICY "staff read customers"
  ON public.customers FOR SELECT TO authenticated
  USING (
    public.is_staff()
    AND tenant_id = public.current_tenant_id()
  );

CREATE POLICY "staff write customers"
  ON public.customers FOR ALL TO authenticated
  USING (
    public.is_staff()
    AND tenant_id = public.current_tenant_id()
  )
  WITH CHECK (
    public.is_staff()
    AND tenant_id = public.current_tenant_id()
  );

-- ─── 5. sessions ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sessions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id            uuid NOT NULL REFERENCES public.devices(id) ON DELETE RESTRICT,
  customer_id          uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  started_at           timestamptz NOT NULL DEFAULT now(),
  ended_at             timestamptz,
  duration_minutes     integer,
  total_cost           numeric(10,2),
  status               text NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended')),
  session_type         text NOT NULL DEFAULT 'open' CHECK (session_type IN ('open','fixed')),
  play_mode            text NOT NULL DEFAULT 'single' CHECK (play_mode IN ('single','multiplayer')),
  scheduled_end        timestamptz,
  hourly_rate_override numeric(10,2) CHECK (hourly_rate_override >= 0),
  grace_period_minutes integer NOT NULL DEFAULT 0 CHECK (grace_period_minutes >= 0),
  is_overtime          boolean NOT NULL DEFAULT false,
  overtime_minutes     integer CHECK (overtime_minutes >= 0),
  edited_start_at      boolean NOT NULL DEFAULT false,
  is_paused            boolean NOT NULL DEFAULT false,
  total_paused_minutes integer NOT NULL DEFAULT 0 CHECK (total_paused_minutes >= 0),
  created_by           uuid REFERENCES public.users(id) ON DELETE SET NULL,
  tenant_id            uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS is_paused boolean NOT NULL DEFAULT false;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS total_paused_minutes integer NOT NULL DEFAULT 0;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read sessions"  ON public.sessions;
DROP POLICY IF EXISTS "staff write sessions" ON public.sessions;

CREATE POLICY "staff read sessions"
  ON public.sessions FOR SELECT TO authenticated
  USING (
    public.is_staff()
    AND tenant_id = public.current_tenant_id()
  );

CREATE POLICY "staff write sessions"
  ON public.sessions FOR ALL TO authenticated
  USING (
    public.is_staff()
    AND tenant_id = public.current_tenant_id()
  )
  WITH CHECK (
    public.is_staff()
    AND tenant_id = public.current_tenant_id()
  );

-- ─── 6. shifts ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shifts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tenant_id      uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  started_at     timestamptz NOT NULL DEFAULT now(),
  ended_at       timestamptz,
  opening_cash   numeric(10,2) NOT NULL DEFAULT 0 CHECK (opening_cash >= 0),
  closing_cash   numeric(10,2) CHECK (closing_cash >= 0),
  total_revenue  numeric(10,2) NOT NULL DEFAULT 0 CHECK (total_revenue >= 0),
  total_expenses numeric(10,2) NOT NULL DEFAULT 0 CHECK (total_expenses >= 0),
  notes          text,
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read shifts"  ON public.shifts;
DROP POLICY IF EXISTS "staff write shifts" ON public.shifts;

CREATE POLICY "staff read shifts"
  ON public.shifts FOR SELECT TO authenticated
  USING (
    public.is_staff()
    AND tenant_id = public.current_tenant_id()
  );

CREATE POLICY "staff write shifts"
  ON public.shifts FOR ALL TO authenticated
  USING (
    public.is_staff()
    AND tenant_id = public.current_tenant_id()
  )
  WITH CHECK (
    public.is_staff()
    AND tenant_id = public.current_tenant_id()
  );

-- ─── 7. invoices ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid NOT NULL UNIQUE REFERENCES public.sessions(id) ON DELETE CASCADE,
  amount          numeric(10,2) NOT NULL CHECK (amount >= 0),
  subtotal        numeric(10,2) DEFAULT 0,
  discount_amount numeric(10,2) DEFAULT 0,
  discount_type   text DEFAULT 'none' CHECK (discount_type IN ('none','percentage','fixed')),
  discount_value  numeric(10,2) DEFAULT 0,
  service_fee     numeric(10,2) DEFAULT 0,
  service_rate    numeric(10,2) DEFAULT 0,
  rounding_delta  numeric(10,2) DEFAULT 0,
  notes           text,
  paid            boolean NOT NULL DEFAULT false,
  payment_method  text DEFAULT 'cash' CHECK (payment_method IN ('cash','card','transfer','wallet')),
  shift_id        uuid REFERENCES public.shifts(id) ON DELETE SET NULL,
  created_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  issued_at       timestamptz NOT NULL DEFAULT now(),
  paid_at         timestamptz,
  tenant_id       uuid REFERENCES public.tenants(id) ON DELETE CASCADE
);

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS shift_id uuid REFERENCES public.shifts(id) ON DELETE SET NULL;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS subtotal numeric(10,2) DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS discount_amount numeric(10,2) DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS discount_type text DEFAULT 'none';
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS discount_value numeric(10,2) DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS service_fee numeric(10,2) DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS service_rate numeric(10,2) DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS rounding_delta numeric(10,2) DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read invoices"  ON public.invoices;
DROP POLICY IF EXISTS "staff write invoices" ON public.invoices;

CREATE POLICY "staff read invoices"
  ON public.invoices FOR SELECT TO authenticated
  USING (
    public.is_staff()
    AND tenant_id = public.current_tenant_id()
  );

CREATE POLICY "staff write invoices"
  ON public.invoices FOR ALL TO authenticated
  USING (
    public.is_staff()
    AND tenant_id = public.current_tenant_id()
  )
  WITH CHECK (
    public.is_staff()
    AND tenant_id = public.current_tenant_id()
  );

-- ─── 8. reservations ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reservations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id      uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  customer_id    uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  reserved_from  timestamptz NOT NULL,
  reserved_until timestamptz NOT NULL,
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','cancelled','completed')),
  notes          text,
  created_by     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  tenant_id      uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read reservations"  ON public.reservations;
DROP POLICY IF EXISTS "staff write reservations" ON public.reservations;

CREATE POLICY "staff read reservations"
  ON public.reservations FOR SELECT TO authenticated
  USING (
    public.is_staff()
    AND tenant_id = public.current_tenant_id()
  );

CREATE POLICY "staff write reservations"
  ON public.reservations FOR ALL TO authenticated
  USING (
    public.is_staff()
    AND tenant_id = public.current_tenant_id()
  )
  WITH CHECK (
    public.is_staff()
    AND tenant_id = public.current_tenant_id()
  );

-- ─── 9. products ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.products (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  price      numeric(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  cost_price numeric(10,2) CHECK (cost_price >= 0),
  stock      integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  tenant_id  uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cost_price numeric(10,2);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock integer NOT NULL DEFAULT 0;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read products"  ON public.products;
DROP POLICY IF EXISTS "admin write products" ON public.products;

CREATE POLICY "staff read products"
  ON public.products FOR SELECT TO authenticated
  USING (
    public.is_staff()
    AND tenant_id = public.current_tenant_id()
  );

CREATE POLICY "admin write products"
  ON public.products FOR ALL TO authenticated
  USING (
    public.is_admin()
    AND tenant_id = public.current_tenant_id()
  )
  WITH CHECK (
    public.is_admin()
    AND tenant_id = public.current_tenant_id()
  );

-- ─── 10. rooms ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rooms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  icon        text NOT NULL DEFAULT 'sports_esports',
  device_id   uuid REFERENCES public.devices(id) ON DELETE SET NULL,
  tenant_id   uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read rooms"  ON public.rooms;
DROP POLICY IF EXISTS "admin write rooms" ON public.rooms;

CREATE POLICY "staff read rooms"
  ON public.rooms FOR SELECT TO authenticated
  USING (
    public.is_staff()
    AND tenant_id = public.current_tenant_id()
  );

CREATE POLICY "admin write rooms"
  ON public.rooms FOR ALL TO authenticated
  USING (
    public.is_admin()
    AND tenant_id = public.current_tenant_id()
  )
  WITH CHECK (
    public.is_admin()
    AND tenant_id = public.current_tenant_id()
  );

-- ─── 11. shift_expenses ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shift_expenses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id    uuid NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  tenant_id   uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  amount      numeric(10,2) NOT NULL CHECK (amount > 0),
  category    text NOT NULL DEFAULT '',
  description text NOT NULL,
  created_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shift_expenses ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.shift_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read shift_expenses"  ON public.shift_expenses;
DROP POLICY IF EXISTS "staff write shift_expenses" ON public.shift_expenses;

CREATE POLICY "staff read shift_expenses"
  ON public.shift_expenses FOR SELECT TO authenticated
  USING (
    public.is_staff()
    AND tenant_id = public.current_tenant_id()
  );

CREATE POLICY "staff write shift_expenses"
  ON public.shift_expenses FOR ALL TO authenticated
  USING (
    public.is_staff()
    AND tenant_id = public.current_tenant_id()
  )
  WITH CHECK (
    public.is_staff()
    AND tenant_id = public.current_tenant_id()
  );

-- ─── 12. session_transfers ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.session_transfers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  from_device_id    uuid NOT NULL REFERENCES public.devices(id),
  to_device_id      uuid NOT NULL REFERENCES public.devices(id),
  started_at        timestamptz NOT NULL,
  transferred_at    timestamptz NOT NULL DEFAULT now(),
  duration_minutes  integer NOT NULL,
  hourly_rate       numeric(10,2) NOT NULL,
  play_mode         text NOT NULL DEFAULT 'single' CHECK (play_mode IN ('single', 'multiplayer')),
  cost              numeric(10,2) NOT NULL DEFAULT 0,
  transferred_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  tenant_id         uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.session_transfers ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.session_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read session_transfers"  ON public.session_transfers;
DROP POLICY IF EXISTS "staff write session_transfers" ON public.session_transfers;

CREATE POLICY "staff read session_transfers"
  ON public.session_transfers FOR SELECT TO authenticated
  USING (
    public.is_staff()
    AND tenant_id = public.current_tenant_id()
  );

CREATE POLICY "staff write session_transfers"
  ON public.session_transfers FOR ALL TO authenticated
  USING (
    public.is_staff()
    AND tenant_id = public.current_tenant_id()
  )
  WITH CHECK (
    public.is_staff()
    AND tenant_id = public.current_tenant_id()
  );

-- ─── 13. session_pauses ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.session_pauses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  tenant_id    uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  paused_at    timestamptz NOT NULL DEFAULT now(),
  resumed_at   timestamptz,
  paused_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  resumed_by   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reason       text
);

ALTER TABLE public.session_pauses ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.session_pauses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read session_pauses"  ON public.session_pauses;
DROP POLICY IF EXISTS "staff write session_pauses" ON public.session_pauses;

CREATE POLICY "staff read session_pauses"
  ON public.session_pauses FOR SELECT TO authenticated
  USING (
    public.is_staff()
    AND tenant_id = public.current_tenant_id()
  );

CREATE POLICY "staff write session_pauses"
  ON public.session_pauses FOR ALL TO authenticated
  USING (
    public.is_staff()
    AND tenant_id = public.current_tenant_id()
  )
  WITH CHECK (
    public.is_staff()
    AND tenant_id = public.current_tenant_id()
  );

-- ─── 14. standalone_orders ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.standalone_orders (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id     uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity       integer NOT NULL CHECK (quantity > 0),
  unit_price     numeric(10,2) NOT NULL CHECK (unit_price >= 0),
  cost_price     numeric(10,2) CHECK (cost_price >= 0),
  total_price    numeric(10,2) NOT NULL CHECK (total_price >= 0),
  payment_method text DEFAULT 'cash' CHECK (payment_method IN ('cash','card','transfer','wallet')),
  shift_id       uuid REFERENCES public.shifts(id) ON DELETE SET NULL,
  created_by     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.standalone_orders ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.standalone_orders ADD COLUMN IF NOT EXISTS shift_id uuid REFERENCES public.shifts(id) ON DELETE SET NULL;
ALTER TABLE public.standalone_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read standalone_orders"  ON public.standalone_orders;
DROP POLICY IF EXISTS "staff write standalone_orders" ON public.standalone_orders;

CREATE POLICY "staff read standalone_orders"
  ON public.standalone_orders FOR SELECT TO authenticated
  USING (
    public.is_staff()
    AND tenant_id = public.current_tenant_id()
  );

CREATE POLICY "staff write standalone_orders"
  ON public.standalone_orders FOR ALL TO authenticated
  USING (
    public.is_staff()
    AND tenant_id = public.current_tenant_id()
  )
  WITH CHECK (
    public.is_staff()
    AND tenant_id = public.current_tenant_id()
  );

-- ─── 15. product_stock_logs ───────────────────────────────────────────────────
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

ALTER TABLE public.product_stock_logs ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.product_stock_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read stock logs"   ON public.product_stock_logs;
DROP POLICY IF EXISTS "staff write stock logs"  ON public.product_stock_logs;

CREATE POLICY "staff read stock logs"
  ON public.product_stock_logs FOR SELECT TO authenticated
  USING (
    public.is_staff()
    AND tenant_id = public.current_tenant_id()
  );

CREATE POLICY "staff write stock logs"
  ON public.product_stock_logs FOR ALL TO authenticated
  USING (
    public.is_staff()
    AND tenant_id = public.current_tenant_id()
  )
  WITH CHECK (
    public.is_staff()
    AND tenant_id = public.current_tenant_id()
  );

-- ─── 16. session_orders ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.session_orders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  product_id  uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity    integer NOT NULL CHECK (quantity > 0),
  unit_price  numeric(10,2) NOT NULL CHECK (unit_price >= 0),
  total_price numeric(10,2) NOT NULL CHECK (total_price >= 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.session_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read session_orders"  ON public.session_orders;
DROP POLICY IF EXISTS "staff write session_orders" ON public.session_orders;

CREATE POLICY "staff read session_orders"
  ON public.session_orders FOR SELECT TO authenticated
  USING (
    public.is_staff()
    AND EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_orders.session_id
        AND s.tenant_id = public.current_tenant_id()
    )
  );

CREATE POLICY "staff write session_orders"
  ON public.session_orders FOR ALL TO authenticated
  USING (
    public.is_staff()
    AND EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_orders.session_id
        AND s.tenant_id = public.current_tenant_id()
    )
  )
  WITH CHECK (
    public.is_staff()
    AND EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_orders.session_id
        AND s.tenant_id = public.current_tenant_id()
    )
  );

-- ─── 17. session_audit_log ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.session_audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  edited_by     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  field_changed text NOT NULL,
  old_value     text,
  new_value     text,
  edited_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.session_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read audit logs"  ON public.session_audit_log;
DROP POLICY IF EXISTS "staff write audit logs" ON public.session_audit_log;

CREATE POLICY "staff read audit logs"
  ON public.session_audit_log FOR SELECT TO authenticated
  USING (
    public.is_staff()
    AND EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_audit_log.session_id
        AND s.tenant_id = public.current_tenant_id()
    )
  );

CREATE POLICY "staff write audit logs"
  ON public.session_audit_log FOR INSERT TO authenticated
  WITH CHECK (
    public.is_staff()
    AND EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_audit_log.session_id
        AND s.tenant_id = public.current_tenant_id()
    )
  );

-- ============================================================================
-- END OF MIGRATION 015
-- ============================================================================
