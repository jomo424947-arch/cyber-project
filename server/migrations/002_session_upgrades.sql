-- ============================================================================
-- CCMS — 002_session_upgrades.sql
-- Session Management upgrade migration
-- ============================================================================

-- 1. Upgrade public.sessions table
ALTER TABLE public.sessions 
  ADD COLUMN IF NOT EXISTS session_type text NOT NULL DEFAULT 'open' CHECK (session_type IN ('open', 'fixed')),
  ADD COLUMN IF NOT EXISTS scheduled_end timestamptz NULL,
  ADD COLUMN IF NOT EXISTS hourly_rate_override numeric(10,2) NULL CHECK (hourly_rate_override >= 0),
  ADD COLUMN IF NOT EXISTS grace_period_minutes integer NOT NULL DEFAULT 0 CHECK (grace_period_minutes >= 0),
  ADD COLUMN IF NOT EXISTS is_overtime boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS overtime_minutes integer NULL CHECK (overtime_minutes >= 0),
  ADD COLUMN IF NOT EXISTS edited_start_at boolean NOT NULL DEFAULT false;

-- 2. Upgrade public.customers table
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS username text;

-- Backfill usernames for existing customers to avoid NOT NULL violation
UPDATE public.customers 
  SET username = 'customer_' || substring(id::text from 1 for 8) 
  WHERE username IS NULL;

-- Enforce UNIQUE, NOT NULL, and format check on username
ALTER TABLE public.customers 
  ALTER COLUMN username SET NOT NULL;

ALTER TABLE public.customers 
  DROP CONSTRAINT IF EXISTS customers_username_key;
ALTER TABLE public.customers 
  ADD CONSTRAINT customers_username_key UNIQUE (username);

ALTER TABLE public.customers 
  DROP CONSTRAINT IF EXISTS customers_username_check;
ALTER TABLE public.customers 
  ADD CONSTRAINT customers_username_check CHECK (username ~ '^[a-zA-Z0-9_]+$');

-- 3. Create public.session_audit_log table
CREATE TABLE IF NOT EXISTS public.session_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  edited_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  field_changed text NOT NULL,
  old_value text,
  new_value text,
  edited_at timestamptz DEFAULT now()
);

-- Enable RLS and add policies
ALTER TABLE public.session_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read audit logs" ON public.session_audit_log;
CREATE POLICY "staff read audit logs" ON public.session_audit_log
  FOR SELECT TO authenticated USING ( public.is_staff() );

DROP POLICY IF EXISTS "staff write audit logs" ON public.session_audit_log;
CREATE POLICY "staff write audit logs" ON public.session_audit_log
  FOR INSERT TO authenticated WITH CHECK ( public.is_staff() );
