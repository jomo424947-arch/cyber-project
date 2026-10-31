-- ============================================================================
-- CCMS — 018_monthly_closings.sql
-- Monthly financial closings and accounting periods for Cyber Cafe management.
-- Allows store owners to audit, track, and officially close financial months.
-- ============================================================================

-- 1. Create monthly_closings table
CREATE TABLE IF NOT EXISTS public.monthly_closings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  year              integer NOT NULL CHECK (year >= 2020 AND year <= 2100),
  month             integer NOT NULL CHECK (month >= 1 AND month <= 12),
  status            text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  total_revenue     numeric(12,2) NOT NULL DEFAULT 0,
  device_revenue    numeric(12,2) NOT NULL DEFAULT 0,
  cafe_revenue      numeric(12,2) NOT NULL DEFAULT 0,
  total_expenses    numeric(12,2) NOT NULL DEFAULT 0,
  net_profit        numeric(12,2) NOT NULL DEFAULT 0,
  shifts_count      integer NOT NULL DEFAULT 0,
  cash_discrepancy  numeric(10,2) NOT NULL DEFAULT 0,
  opening_balance   numeric(10,2) NOT NULL DEFAULT 0,
  closing_balance   numeric(10,2) NOT NULL DEFAULT 0,
  closing_notes     text,
  closed_by         uuid REFERENCES public.users(id) ON DELETE SET NULL,
  closed_at         timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Unique index per tenant per year and month
CREATE UNIQUE INDEX IF NOT EXISTS idx_monthly_closings_tenant_period 
  ON public.monthly_closings(tenant_id, year, month);

CREATE INDEX IF NOT EXISTS idx_monthly_closings_tenant 
  ON public.monthly_closings(tenant_id);

CREATE INDEX IF NOT EXISTS idx_monthly_closings_status 
  ON public.monthly_closings(status);

-- 2. Allow shift_expenses to have nullable shift_id for general store expenses (e.g. rent, electricity, salaries)
DO $$
BEGIN
  ALTER TABLE public.shift_expenses ALTER COLUMN shift_id DROP NOT NULL;
EXCEPTION
  WHEN others THEN NULL;
END $$;

-- 3. Trigger to maintain updated_at on monthly_closings
DROP TRIGGER IF EXISTS trg_monthly_closings_updated_at ON public.monthly_closings;
CREATE TRIGGER trg_monthly_closings_updated_at
BEFORE UPDATE ON public.monthly_closings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Enable Row Level Security
ALTER TABLE public.monthly_closings ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "staff read monthly_closings" ON public.monthly_closings;
CREATE POLICY "staff read monthly_closings"
  ON public.monthly_closings FOR SELECT TO authenticated
  USING ( public.is_staff() );

DROP POLICY IF EXISTS "admin write monthly_closings" ON public.monthly_closings;
CREATE POLICY "admin write monthly_closings"
  ON public.monthly_closings FOR ALL TO authenticated
  USING ( public.is_admin() )
  WITH CHECK ( public.is_admin() );

-- ============================================================================
-- End of migration 018
-- ============================================================================

