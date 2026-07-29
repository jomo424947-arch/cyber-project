-- ============================================================================
-- CCMS — 008_multi_tenant_support.sql
-- Adds `tenants` (cafés) table and `tenant_id` column to operational tables.
-- ============================================================================

-- 1. tenants / cafes table
CREATE TABLE IF NOT EXISTS public.tenants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  owner_email text NOT NULL UNIQUE,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'trial')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 2. Add tenant_id to users, devices, customers, sessions, invoices, reservations, products
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

-- 3. Indexes for fast tenant filtering
CREATE INDEX IF NOT EXISTS idx_users_tenant        ON public.users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_devices_tenant      ON public.devices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customers_tenant    ON public.customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sessions_tenant     ON public.sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant     ON public.invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reservations_tenant ON public.reservations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_tenant     ON public.products(tenant_id);

-- 4. Helper function to retrieve user's tenant_id
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT tenant_id FROM public.users WHERE id = auth.uid();
$$;

-- Enable RLS on tenants table
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant owner access" ON public.tenants;
CREATE POLICY "tenant owner access"
  ON public.tenants FOR SELECT TO authenticated
  USING ( id = public.current_tenant_id() OR public.is_admin() );
