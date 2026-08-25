-- ============================================================================
-- CCMS — 016_shift_financial_rpcs.sql
-- Atomic, race-safe functions to update shift financial metrics (total_revenue,
-- total_expenses) without read-modify-write race conditions under concurrent requests.
-- ============================================================================

-- Atomically increment shift total_revenue
create or replace function public.increment_shift_revenue(
  p_shift_id uuid,
  p_amount numeric,
  p_tenant_id uuid default null
)
returns setof public.shifts
language sql
as $$
  update public.shifts
  set total_revenue = greatest(0, round((coalesce(total_revenue, 0) + p_amount)::numeric, 2))
  where id = p_shift_id
    and (p_tenant_id is null or tenant_id = p_tenant_id)
  returning *;
$$;

-- Atomically increment shift total_expenses
create or replace function public.increment_shift_expenses(
  p_shift_id uuid,
  p_amount numeric,
  p_tenant_id uuid default null
)
returns setof public.shifts
language sql
as $$
  update public.shifts
  set total_expenses = greatest(0, round((coalesce(total_expenses, 0) + p_amount)::numeric, 2))
  where id = p_shift_id
    and (p_tenant_id is null or tenant_id = p_tenant_id)
  returning *;
$$;

-- ============================================================================
-- End of migration 016
-- ============================================================================
