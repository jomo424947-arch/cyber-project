-- ============================================================================
-- CCMS — Cyber Café & Gaming Lounge Management System
-- Complete Database Schema (PostgreSQL / Supabase)
--
-- ⚠️  UPDATED to reflect ALL migrations (001 through 009).
-- Run this in a fresh Supabase project to reproduce the full database.
-- For existing projects, run the individual migration files in /server/migrations/.
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

-- Helper: retrieve the current user's tenant_id
create or replace function public.current_tenant_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select tenant_id from public.users where id = auth.uid();
$$;

-- ----------------------------------------------------------------------------
-- 1. tenants — cyber café accounts (multi-tenant support)
-- Added in migration 008
-- ----------------------------------------------------------------------------
create table if not exists public.tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  owner_email text not null unique,
  status      text not null default 'active' check (status in ('active', 'suspended', 'trial')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.tenants enable row level security;

drop policy if exists "tenant owner access" on public.tenants;
create policy "tenant owner access"
  on public.tenants for select to authenticated
  using ( id = public.current_tenant_id() or public.is_admin() );

-- ----------------------------------------------------------------------------
-- 2. users — mirrors auth.users (one row per staff/admin account)
-- Updated in migrations 002 (no changes) and 008 (tenant_id added)
-- ----------------------------------------------------------------------------
create table if not exists public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null unique,
  full_name   text,
  role        text not null default 'staff'
              check (role in ('admin','staff')),
  tenant_id   uuid references public.tenants(id) on delete cascade,
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

alter table public.users enable row level security;

create policy "users read self or admin reads all"
  on public.users for select
  using ( auth.uid() = id or public.is_admin() );

create policy "users update self or admin updates all"
  on public.users for update
  using ( auth.uid() = id or public.is_admin() );

create policy "only admin deletes users"
  on public.users for delete
  using ( public.is_admin() );

create index if not exists idx_users_tenant on public.users(tenant_id);

-- ----------------------------------------------------------------------------
-- 3. devices — every PC / console / VR / billiard table station
-- Updated in migrations 005 (archived), 007 (hourly_rate_multi), 008 (tenant_id), 009 (table type)
-- ----------------------------------------------------------------------------
create table if not exists public.devices (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  type              text not null default 'pc'
                    check (type in ('pc','console','vr','table')),
  status            text not null default 'available'
                    check (status in ('available','in_use','reserved','offline')),
  specs             jsonb,
  hourly_rate       numeric(10,2) not null default 0 check (hourly_rate >= 0),
  hourly_rate_multi numeric(10,2) not null default 0 check (hourly_rate_multi >= 0),
  archived          boolean not null default false,
  tenant_id         uuid references public.tenants(id) on delete cascade,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

drop trigger if exists trg_devices_updated_at on public.devices;
create trigger trg_devices_updated_at
before update on public.devices
for each row execute function public.set_updated_at();

alter table public.devices enable row level security;

create policy "staff read devices"
  on public.devices for select to authenticated
  using ( public.is_staff() );

create policy "admin write devices"
  on public.devices for all to authenticated
  using ( public.is_admin() )
  with check ( public.is_admin() );

create index if not exists idx_devices_tenant on public.devices(tenant_id);

-- ----------------------------------------------------------------------------
-- 4. customers — walk-in or registered customers
-- Updated in migration 002 (username added), 008 (tenant_id)
-- ----------------------------------------------------------------------------
create table if not exists public.customers (
  id         uuid primary key default gen_random_uuid(),
  username   text not null unique check (username ~ '^[a-zA-Z0-9_]+$'),
  name       text not null,
  phone      text,
  email      text,
  tenant_id  uuid references public.tenants(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.customers enable row level security;

create policy "staff read customers"
  on public.customers for select to authenticated
  using ( public.is_staff() );

create policy "staff write customers"
  on public.customers for all to authenticated
  using ( public.is_staff() )
  with check ( public.is_staff() );

create index if not exists idx_customers_tenant on public.customers(tenant_id);

-- ----------------------------------------------------------------------------
-- 5. sessions — every device usage session
-- Updated in migrations 002 (session_type, play_mode, scheduled_end, etc.), 003 (unique index), 008 (tenant_id)
-- ----------------------------------------------------------------------------
create table if not exists public.sessions (
  id                   uuid primary key default gen_random_uuid(),
  device_id            uuid not null references public.devices(id) on delete restrict,
  customer_id          uuid references public.customers(id) on delete set null,
  started_at           timestamptz not null default now(),
  ended_at             timestamptz,
  duration_minutes     integer,
  total_cost           numeric(10,2),
  status               text not null default 'active'
                       check (status in ('active','ended')),
  session_type         text not null default 'open'
                       check (session_type in ('open','fixed')),
  play_mode            text not null default 'single'
                       check (play_mode in ('single','multiplayer')),
  scheduled_end        timestamptz,
  hourly_rate_override numeric(10,2) check (hourly_rate_override >= 0),
  grace_period_minutes integer not null default 0 check (grace_period_minutes >= 0),
  is_overtime          boolean not null default false,
  overtime_minutes     integer check (overtime_minutes >= 0),
  edited_start_at      boolean not null default false,
  created_by           uuid references public.users(id) on delete set null,
  tenant_id            uuid references public.tenants(id) on delete cascade,
  created_at           timestamptz not null default now()
);

create index if not exists idx_sessions_device   on public.sessions(device_id);
create index if not exists idx_sessions_customer on public.sessions(customer_id);
create index if not exists idx_sessions_status   on public.sessions(status);
create index if not exists idx_sessions_tenant   on public.sessions(tenant_id);

-- Enforce only one active session per device at a time (migration 003)
create unique index if not exists idx_sessions_one_active_per_device
  on public.sessions(device_id)
  where status = 'active';

alter table public.sessions enable row level security;

create policy "staff read sessions"
  on public.sessions for select to authenticated
  using ( public.is_staff() );

create policy "staff write sessions"
  on public.sessions for all to authenticated
  using ( public.is_staff() )
  with check ( public.is_staff() );

-- ----------------------------------------------------------------------------
-- 6. invoices — billing records linked to sessions
-- Updated in migration 008 (tenant_id)
-- ----------------------------------------------------------------------------
create table if not exists public.invoices (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null unique references public.sessions(id) on delete cascade,
  amount         numeric(10,2) not null check (amount >= 0),
  paid           boolean not null default false,
  payment_method text default 'cash'
                 check (payment_method in ('cash','card','transfer','wallet')),
  issued_at      timestamptz not null default now(),
  paid_at        timestamptz,
  tenant_id      uuid references public.tenants(id) on delete cascade
);

create index if not exists idx_invoices_session on public.invoices(session_id);
create index if not exists idx_invoices_paid    on public.invoices(paid);
create index if not exists idx_invoices_tenant  on public.invoices(tenant_id);

alter table public.invoices enable row level security;

create policy "staff read invoices"
  on public.invoices for select to authenticated
  using ( public.is_staff() );

create policy "staff write invoices"
  on public.invoices for all to authenticated
  using ( public.is_staff() )
  with check ( public.is_staff() );

-- ----------------------------------------------------------------------------
-- 7. reservations — future device bookings
-- Updated in migration 004 (overlap constraint), 008 (tenant_id)
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
  tenant_id      uuid references public.tenants(id) on delete cascade,
  created_at     timestamptz not null default now()
);

create index if not exists idx_reservations_device  on public.reservations(device_id);
create index if not exists idx_reservations_status  on public.reservations(status);
create index if not exists idx_reservations_window  on public.reservations(device_id, reserved_from, reserved_until);
create index if not exists idx_reservations_tenant  on public.reservations(tenant_id);

alter table public.reservations enable row level security;

create policy "staff read reservations"
  on public.reservations for select to authenticated
  using ( public.is_staff() );

create policy "staff write reservations"
  on public.reservations for all to authenticated
  using ( public.is_staff() )
  with check ( public.is_staff() );

-- ----------------------------------------------------------------------------
-- 8. products — café menu items
-- Added in migration 006, updated in 007 (stock column), 008 (tenant_id)
-- ----------------------------------------------------------------------------
create table if not exists public.products (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  price      numeric(10,2) not null default 0 check (price >= 0),
  stock      integer not null default 0 check (stock >= 0),
  tenant_id  uuid references public.tenants(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_products_tenant on public.products(tenant_id);

alter table public.products enable row level security;

create policy "staff read products"
  on public.products for select to authenticated
  using ( public.is_staff() );

create policy "admin write products"
  on public.products for all to authenticated
  using ( public.is_admin() )
  with check ( public.is_admin() );

-- ----------------------------------------------------------------------------
-- 9. session_orders — café orders linked to gaming sessions
-- Added in migration 006
-- ----------------------------------------------------------------------------
create table if not exists public.session_orders (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions(id) on delete cascade,
  product_id  uuid not null references public.products(id) on delete restrict,
  quantity    integer not null check (quantity > 0),
  unit_price  numeric(10,2) not null check (unit_price >= 0),
  total_price numeric(10,2) not null check (total_price >= 0),
  created_at  timestamptz not null default now()
);

create index if not exists idx_session_orders_session on public.session_orders(session_id);

alter table public.session_orders enable row level security;

create policy "staff read session_orders"
  on public.session_orders for select to authenticated
  using ( public.is_staff() );

create policy "staff write session_orders"
  on public.session_orders for all to authenticated
  using ( public.is_staff() )
  with check ( public.is_staff() );

-- ----------------------------------------------------------------------------
-- 10. session_audit_log — history of edits to sessions
-- Added in migration 002
-- ----------------------------------------------------------------------------
create table if not exists public.session_audit_log (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.sessions(id) on delete cascade,
  edited_by     uuid references public.users(id) on delete set null,
  field_changed text not null,
  old_value     text,
  new_value     text,
  edited_at     timestamptz not null default now()
);

create index if not exists idx_audit_log_session on public.session_audit_log(session_id);

alter table public.session_audit_log enable row level security;

create policy "staff read audit logs"
  on public.session_audit_log for select to authenticated
  using ( public.is_staff() );

create policy "staff write audit logs"
  on public.session_audit_log for insert to authenticated
  with check ( public.is_staff() );

-- ============================================================================
-- Seed data — starter devices (optional, per tenant).
-- After creating your first tenant and user, assign tenant_id to these rows.
-- ============================================================================
-- insert into public.devices (name, type, status, hourly_rate, hourly_rate_multi, specs, tenant_id)
-- values
--   ('PC-01','pc','available', 5.00, 4.00, '{"cpu":"i5-12400F","gpu":"RTX 3060","ram":"16GB"}', '<tenant_id>'),
--   ('PS5-01','console','available', 7.00, 6.00, '{"platform":"PlayStation 5"}', '<tenant_id>'),
--   ('VR-01','vr','available', 10.00, 8.00, '{"headset":"Meta Quest 3"}', '<tenant_id>');

-- ============================================================================
-- End of complete schema
-- ============================================================================
