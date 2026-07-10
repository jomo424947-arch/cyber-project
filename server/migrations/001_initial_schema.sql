-- ============================================================================
-- CCMS — 001_initial_schema.sql
-- Initial database migration (PostgreSQL / Supabase).
--
-- Run this in the Supabase SQL Editor (or `psql`) to create the core tables.
-- At minimum it creates: devices, sessions, reservations (plus the supporting
-- customers, invoices, and users tables they reference).
-- Idempotent: safe to re-run (uses `if not exists`).
-- ============================================================================

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- Generic updated_at trigger function.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- users — mirrors auth.users (one row per staff/admin account)
-- ----------------------------------------------------------------------------
create table if not exists public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null unique,
  full_name   text,
  role        text not null default 'staff'
              check (role in ('admin','staff')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists trg_users_updated_at on public.users;
create trigger trg_users_updated_at
before update on public.users
for each row execute function public.set_updated_at();

-- Auto-create a public.users row when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    coalesce(new.raw_user_meta_data->>'role', 'staff')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- devices — every PC / console / VR station
-- ----------------------------------------------------------------------------
create table if not exists public.devices (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  type        text not null default 'pc'
              check (type in ('pc','console','vr')),
  status      text not null default 'available'
              check (status in ('available','in_use','reserved','offline')),
  specs       jsonb,
  hourly_rate numeric(10,2) not null default 0 check (hourly_rate >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists trg_devices_updated_at on public.devices;
create trigger trg_devices_updated_at
before update on public.devices
for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- customers — walk-in or registered customers
-- ----------------------------------------------------------------------------
create table if not exists public.customers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  phone       text,
  email       text,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- sessions — every device usage session
-- ----------------------------------------------------------------------------
create table if not exists public.sessions (
  id               uuid primary key default gen_random_uuid(),
  device_id        uuid not null references public.devices(id) on delete restrict,
  customer_id      uuid references public.customers(id) on delete set null,
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  duration_minutes integer,
  total_cost       numeric(10,2),
  status           text not null default 'active'
                   check (status in ('active','ended')),
  created_by       uuid references public.users(id) on delete set null,
  created_at       timestamptz not null default now()
);

create index if not exists idx_sessions_device   on public.sessions(device_id);
create index if not exists idx_sessions_customer on public.sessions(customer_id);
create index if not exists idx_sessions_status   on public.sessions(status);

-- ----------------------------------------------------------------------------
-- invoices — billing records linked to sessions
-- ----------------------------------------------------------------------------
create table if not exists public.invoices (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.sessions(id) on delete cascade,
  amount         numeric(10,2) not null check (amount >= 0),
  paid           boolean not null default false,
  payment_method text default 'cash'
                 check (payment_method in ('cash','card','transfer','wallet')),
  issued_at      timestamptz not null default now(),
  paid_at        timestamptz
);

create index if not exists idx_invoices_session on public.invoices(session_id);
create index if not exists idx_invoices_paid    on public.invoices(paid);

-- ----------------------------------------------------------------------------
-- reservations — future device bookings
-- ----------------------------------------------------------------------------
create table if not exists public.reservations (
  id             uuid primary key default gen_random_uuid(),
  device_id      uuid not null references public.devices(id) on delete cascade,
  customer_id    uuid references public.customers(id) on delete set null,
  reserved_from  timestamptz not null,
  reserved_until timestamptz not null,
  status         text not null default 'pending'
                 check (status in ('pending','active','cancelled','completed')),
  notes          text,
  created_by     uuid references public.users(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists idx_reservations_device on public.reservations(device_id);
create index if not exists idx_reservations_status on public.reservations(status);
create index if not exists idx_reservations_window on public.reservations(device_id, reserved_from, reserved_until);

-- ============================================================================
-- End of migration 001
-- ============================================================================
