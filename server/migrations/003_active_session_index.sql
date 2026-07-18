-- ============================================================================
-- CCMS — 003_active_session_index.sql
-- Adds a partial unique index to guarantee at most one active session per device.
-- This is the DB-level guard against the check-then-insert race condition in
-- startSession. Any concurrent INSERT violating this index returns PG error
-- code 23505 (unique_violation), which the controller catches and translates
-- to a SESSION_ACTIVE conflict error.
-- Idempotent: safe to re-run.
-- ============================================================================

create unique index if not exists idx_sessions_one_active_per_device
  on public.sessions(device_id) where status = 'active';

-- ============================================================================
-- End of migration 003
-- ============================================================================
