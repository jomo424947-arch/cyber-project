-- ============================================================================
-- CCMS — Cyber Café & Gaming Lounge Management System
-- Database schema (PostgreSQL / Supabase)
-- Run this in the Supabase SQL Editor (or `psql`) to reproduce the database.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Extensions & helpers
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "pgjwt";        -- JWT helpers (optional)

-- Generic updated_at trigger function
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
-- 1. users — mirrors auth.users (one row per staff/admin account)
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
-- 2. devices — every PC / console / VR station
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

create trigger trg_devices_updated_at
before update on public.devices
for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3. customers — walk-in or registered customers
-- ----------------------------------------------------------------------------
create table if not exists public.customers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  phone       text,
  email       text,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 4. sessions — every device usage session
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

create index idx_sessions_device   on public.sessions(device_id);
create index idx_sessions_customer on public.sessions(customer_id);
create index idx_sessions_status   on public.sessions(status);

-- ----------------------------------------------------------------------------
-- 5. invoices — billing records linked to sessions
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

create index idx_invoices_session on public.invoices(session_id);
create index idx_invoices_paid    on public.invoices(paid);

-- ----------------------------------------------------------------------------
-- 6. reservations — future device bookings
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

create index idx_reservations_device on public.reservations(device_id);
create index idx_reservations_status on public.reservations(status);
create index idx_reservations_window on public.reservations(device_id, reserved_from, reserved_until);

-- ============================================================================
-- Row Level Security (RLS)
-- - Authenticated staff/admin can READ all operational tables.
-- - Staff & admin can WRITE to customers / sessions / invoices / reservations.
-- - Only admins can WRITE to devices and users.
-- ============================================================================

alter table public.users        enable row level security;
alter table public.devices      enable row level security;
alter table public.customers    enable row level security;
alter table public.sessions     enable row level security;
alter table public.invoices     enable row level security;
alter table public.reservations enable row level security;

-- Helper: is the current user an admin?
create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Helper: is the current user authenticated staff/admin?
create or replace function public.is_staff()
returns boolean
language sql
security definer set search_path = public
as $$
  select exists (
    select 1 from public.users where id = auth.uid()
  );
$$;

-- -------- users --------
create policy "users read self or admin reads all"
  on public.users for select
  using ( auth.uid() = id or public.is_admin() );

create policy "users update self or admin updates all"
  on public.users for update
  using ( auth.uid() = id or public.is_admin() );

create policy "only admin deletes users"
  on public.users for delete
  using ( public.is_admin() );

-- -------- devices --------
create policy "staff read devices"
  on public.devices for select to authenticated
  using ( public.is_staff() );

create policy "admin write devices"
  on public.devices for all to authenticated
  using ( public.is_admin() )
  with check ( public.is_admin() );

-- -------- customers --------
create policy "staff read customers"
  on public.customers for select to authenticated
  using ( public.is_staff() );

create policy "staff write customers"
  on public.customers for all to authenticated
  using ( public.is_staff() )
  with check ( public.is_staff() );

-- -------- sessions --------
create policy "staff read sessions"
  on public.sessions for select to authenticated
  using ( public.is_staff() );

create policy "staff write sessions"
  on public.sessions for all to authenticated
  using ( public.is_staff() )
  with check ( public.is_staff() );

-- -------- invoices --------
create policy "staff read invoices"
  on public.invoices for select to authenticated
  using ( public.is_staff() );

create policy "staff write invoices"
  on public.invoices for all to authenticated
  using ( public.is_staff() )
  with check ( public.is_staff() );

-- -------- reservations --------
create policy "staff read reservations"
  on public.reservations for select to authenticated
  using ( public.is_staff() );

create policy "staff write reservations"
  on public.reservations for all to authenticated
  using ( public.is_staff() )
  with check ( public.is_staff() );

-- ============================================================================
-- Seed data (optional) — a starter admin + sample devices.
-- The default admin password is set when you create the auth user in Supabase.
-- ============================================================================
insert into public.devices (name, type, status, hourly_rate, specs)
values
  ('PC-01','pc','available', 5.00, '{"cpu":"i5-12400F","gpu":"RTX 3060","ram":"16GB"}'),
  ('PC-02','pc','available', 5.00, '{"cpu":"i5-12400F","gpu":"RTX 3060","ram":"16GB"}'),
  ('PC-03','pc','available', 4.00, '{"cpu":"i3-12100F","gpu":"GTX 1650","ram":"8GB"}'),
  ('PS5-01','console','available', 7.00, '{"platform":"PlayStation 5"}'),
  ('PS5-02','console','available', 7.00, '{"platform":"PlayStation 5"}'),
  ('XBOX-01','console','available', 6.00, '{"platform":"Xbox Series X"}'),
  ('VR-01','vr','available', 10.00, '{"headset":"Meta Quest 3"}'),
  ('VR-02','vr','offline', 10.00, '{"headset":"Valve Index"}')
on conflict do nothing;

-- ============================================================================
-- End of schema
-- ============================================================================
