-- ============================================================================
-- CCMS — 010_session_pause_support.sql
-- Adds pause/resume tracking to sessions to exclude idle time from billing.
-- ============================================================================

-- 1. Denormalized fields on sessions for fast billing lookups
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS is_paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS total_paused_minutes integer NOT NULL DEFAULT 0 CHECK (total_paused_minutes >= 0);

-- 2. session_pauses — one row per pause period (source of truth)
CREATE TABLE IF NOT EXISTS public.session_pauses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  tenant_id    uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  paused_at    timestamptz NOT NULL DEFAULT now(),
  resumed_at   timestamptz, -- NULL while the pause is still active
  paused_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  resumed_by   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reason       text
);

CREATE INDEX IF NOT EXISTS idx_session_pauses_session ON public.session_pauses(session_id);
CREATE INDEX IF NOT EXISTS idx_session_pauses_tenant  ON public.session_pauses(tenant_id);

-- Enforce at most ONE open (resumed_at IS NULL) pause per session — this is
-- the DB-level guard against double-pause race conditions.
CREATE UNIQUE INDEX IF NOT EXISTS idx_session_pauses_one_open_per_session
  ON public.session_pauses(session_id) WHERE resumed_at IS NULL;

ALTER TABLE public.session_pauses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read session_pauses" ON public.session_pauses;
CREATE POLICY "staff read session_pauses"
  ON public.session_pauses FOR SELECT TO authenticated
  USING ( public.is_staff() );

DROP POLICY IF EXISTS "staff write session_pauses" ON public.session_pauses;
CREATE POLICY "staff write session_pauses"
  ON public.session_pauses FOR ALL TO authenticated
  USING ( public.is_staff() )
  WITH CHECK ( public.is_staff() );

-- ============================================================================
-- End of migration 010
-- ============================================================================
