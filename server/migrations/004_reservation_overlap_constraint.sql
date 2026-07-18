-- ============================================================================
-- CCMS — 004_reservation_overlap_constraint.sql
-- Adds a trigger-based overlap guard on reservations to prevent concurrent
-- inserts creating conflicting (overlapping, non-cancelled) reservations for
-- the same device. The trigger raises errcode P0001 which the server catches
-- and translates to RESERVATION_CONFLICT.
--
-- Also enables btree_gist extension (required for tsrange exclusion constraints
-- if you wish to upgrade later; the trigger approach is used here for broad
-- Supabase compatibility without superuser extension grants).
-- Idempotent: safe to re-run.
-- ============================================================================

-- Enable btree_gist extension (may already be available in Supabase)
create extension if not exists "btree_gist";

-- Overlap check trigger function
create or replace function public.check_reservation_overlap()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from public.reservations
    where device_id = new.device_id
      and status <> 'cancelled'
      and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and reserved_from < new.reserved_until
      and reserved_until > new.reserved_from
  ) then
    raise exception 'RESERVATION_OVERLAP: This device is already reserved for part of the requested time window'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_reservation_overlap on public.reservations;
create trigger trg_check_reservation_overlap
before insert or update on public.reservations
for each row execute function public.check_reservation_overlap();

-- ============================================================================
-- End of migration 004
-- ============================================================================
