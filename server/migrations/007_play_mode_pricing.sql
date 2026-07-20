-- ============================================================================
-- CCMS — 007_play_mode_pricing.sql
-- Adds support for separate Single and Multiplayer pricing rates.
-- ============================================================================

-- 1. Add hourly_rate_multi to devices table
ALTER TABLE public.devices
  ADD COLUMN IF NOT EXISTS hourly_rate_multi numeric(10,2) NOT NULL DEFAULT 0 CHECK (hourly_rate_multi >= 0);

-- Update existing devices to have hourly_rate_multi equal to hourly_rate as a fallback
UPDATE public.devices
  SET hourly_rate_multi = hourly_rate
  WHERE hourly_rate_multi = 0;

-- 2. Add play_mode to sessions table
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS play_mode text NOT NULL DEFAULT 'single' CHECK (play_mode IN ('single', 'multiplayer'));
