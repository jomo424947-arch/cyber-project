-- Migration 013: Shifts and Expenses support
-- Adds public.shifts, public.shift_expenses, and links invoices to shifts and employees

-- 1. Create shifts table
create table if not exists public.shifts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users(id) on delete cascade,
  tenant_id      uuid references public.tenants(id) on delete cascade,
  started_at     timestamptz not null default now(),
  ended_at       timestamptz,
  opening_cash   numeric(10,2) not null default 0 check (opening_cash >= 0),
  closing_cash   numeric(10,2) check (closing_cash >= 0),
  total_revenue  numeric(10,2) not null default 0 check (total_revenue >= 0),
  total_expenses numeric(10,2) not null default 0 check (total_expenses >= 0),
  notes          text,
  status         text not null default 'active' check (status in ('active','closed')),
  created_at     timestamptz not null default now()
);

create index if not exists idx_shifts_user   on public.shifts(user_id);
create index if not exists idx_shifts_tenant on public.shifts(tenant_id);
create index if not exists idx_shifts_status on public.shifts(status);

-- Only one active shift per user at any time
create unique index if not exists idx_shifts_one_active_per_user
  on public.shifts(user_id) where status = 'active';

alter table public.shifts enable row level security;

create policy "staff read shifts"
  on public.shifts for select to authenticated
  using ( public.is_staff() );

create policy "staff write shifts"
  on public.shifts for all to authenticated
  using ( public.is_staff() )
  with check ( public.is_staff() );

-- 2. Create shift_expenses table
create table if not exists public.shift_expenses (
  id          uuid primary key default gen_random_uuid(),
  shift_id    uuid not null references public.shifts(id) on delete cascade,
  tenant_id   uuid references public.tenants(id) on delete cascade,
  amount      numeric(10,2) not null check (amount > 0),
  category    text not null default '',
  description text not null,
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_shift_expenses_shift  on public.shift_expenses(shift_id);
create index if not exists idx_shift_expenses_tenant on public.shift_expenses(tenant_id);

alter table public.shift_expenses enable row level security;

create policy "staff read shift_expenses"
  on public.shift_expenses for select to authenticated
  using ( public.is_staff() );

create policy "staff write shift_expenses"
  on public.shift_expenses for all to authenticated
  using ( public.is_staff() )
  with check ( public.is_staff() );

-- 3. Add shift_id and created_by to invoices
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'invoices' and column_name = 'shift_id'
  ) then
    alter table public.invoices add column shift_id uuid references public.shifts(id) on delete set null;
  end if;

  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'invoices' and column_name = 'created_by'
  ) then
    alter table public.invoices add column created_by uuid references public.users(id) on delete set null;
  end if;
end $$;

create index if not exists idx_invoices_shift on public.invoices(shift_id);
create index if not exists idx_invoices_created_by on public.invoices(created_by);
