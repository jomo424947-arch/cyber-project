-- ============================================================================
-- CCMS — 005_device_archive.sql
-- Adds `archived` column to devices to support soft-deletion (archiving) of
-- devices that have session history, preserving relational integrity while
-- removing them from active view.
-- Idempotent: safe to re-run.
-- ============================================================================

ALTER TABLE public.devices
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

-- ============================================================================
-- End of migration 005
-- ============================================================================
