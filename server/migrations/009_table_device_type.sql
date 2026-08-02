-- ============================================================================
-- CCMS — 009_table_device_type.sql
-- Adds 'table' as a valid device type (billiard, ping-pong, foosball, etc.)
-- ============================================================================

DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'public.devices'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%type%IN%';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.devices DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE public.devices
  ADD CONSTRAINT devices_type_check CHECK (type IN ('pc','console','vr','table'));

-- ============================================================================
-- End of migration 009
-- ============================================================================
