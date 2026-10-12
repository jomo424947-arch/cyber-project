-- ============================================================================
-- CCMS — 017_cafe_tables.sql
-- Adds cafe_tables table for managing dedicated cafe seating & orders.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.cafe_tables (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_number text NOT NULL,
  name         text NOT NULL,
  capacity     integer NOT NULL DEFAULT 4 CHECK (capacity > 0),
  device_id    uuid REFERENCES public.devices(id) ON DELETE SET NULL,
  tenant_id    uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Ensure table number is unique per tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_cafe_tables_tenant_number 
  ON public.cafe_tables(tenant_id, table_number);

CREATE INDEX IF NOT EXISTS idx_cafe_tables_tenant 
  ON public.cafe_tables(tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cafe_tables_device 
  ON public.cafe_tables(device_id) WHERE device_id IS NOT NULL;

-- Trigger to maintain updated_at
DROP TRIGGER IF EXISTS trg_cafe_tables_updated_at ON public.cafe_tables;
CREATE TRIGGER trg_cafe_tables_updated_at
BEFORE UPDATE ON public.cafe_tables
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS
ALTER TABLE public.cafe_tables ENABLE ROW LEVEL SECURITY;

-- Policies for tenant-isolation
DROP POLICY IF EXISTS "staff read cafe_tables" ON public.cafe_tables;
CREATE POLICY "staff read cafe_tables"
  ON public.cafe_tables FOR SELECT TO authenticated
  USING ( public.is_staff() );

DROP POLICY IF EXISTS "admin write cafe_tables" ON public.cafe_tables;
CREATE POLICY "admin write cafe_tables"
  ON public.cafe_tables FOR ALL TO authenticated
  USING ( public.is_admin() )
  WITH CHECK ( public.is_admin() );

-- ============================================================================
-- End of migration 017
-- ============================================================================
