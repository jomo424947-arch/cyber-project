-- ============================================================================
-- CCMS Migration 014: Session Transfers & Invoice Discounts / Rounding
-- ============================================================================

-- 1. Create session_transfers table
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

CREATE INDEX IF NOT EXISTS idx_session_transfers_session ON public.session_transfers(session_id);
CREATE INDEX IF NOT EXISTS idx_session_transfers_tenant ON public.session_transfers(tenant_id);

ALTER TABLE public.session_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read session_transfers"
  ON public.session_transfers FOR SELECT TO authenticated
  USING ( public.is_staff() );

CREATE POLICY "staff write session_transfers"
  ON public.session_transfers FOR ALL TO authenticated
  USING ( public.is_staff() )
  WITH CHECK ( public.is_staff() );

-- 2. Update invoices table with subtotal, discount, service fee, and cash rounding columns
ALTER TABLE public.invoices 
  ADD COLUMN IF NOT EXISTS subtotal numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_type text DEFAULT 'none' CHECK (discount_type IN ('none', 'percentage', 'fixed')),
  ADD COLUMN IF NOT EXISTS discount_value numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_fee numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_rate numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rounding_delta numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes text;
