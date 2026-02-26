-- FlagPlant MVP schema (Phase 1)
-- Run in Supabase SQL editor.

create extension if not exists pgcrypto;

-- ===== Enums =====
create type public.user_role as enum ('user', 'admin');
create type public.order_type as enum ('buy', 'sell');
create type public.order_status as enum ('pending', 'executed', 'cancelled', 'failed');
create type public.job_type as enum ('close_compute', 'publish');
create type public.job_status as enum ('queued', 'running', 'success', 'failed');

-- ===== Profiles and wallets =====
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (char_length(username) between 3 and 24),
  email text unique not null,
  role public.user_role not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  liquid_flags numeric(18,6) not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (liquid_flags >= 0)
);

-- ===== Social opinions =====
create table if not exists public.opinions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 280),
  submitted_for_date date not null,
  created_at timestamptz not null default now(),
  status text not null default 'active',
  unique (user_id, submitted_for_date)
);

create table if not exists public.opinion_assignments (
  id uuid primary key default gen_random_uuid(),
  opinion_id uuid not null references public.opinions(id) on delete cascade,
  viewer_user_id uuid not null references public.profiles(id) on delete cascade,
  assigned_for_date date not null,
  shown_at timestamptz,
  unique (opinion_id, viewer_user_id, assigned_for_date)
);

create table if not exists public.opinion_votes (
  id uuid primary key default gen_random_uuid(),
  opinion_id uuid not null references public.opinions(id) on delete cascade,
  voter_user_id uuid not null references public.profiles(id) on delete cascade,
  assigned_for_date date not null,
  created_at timestamptz not null default now(),
  unique (opinion_id, voter_user_id, assigned_for_date)
);

create table if not exists public.daily_winners (
  winner_date date not null,
  rank int not null check (rank between 1 and 5),
  user_id uuid not null references public.profiles(id) on delete cascade,
  opinion_id uuid not null references public.opinions(id) on delete cascade,
  votes_received int not null default 0,
  reward_flags numeric(18,6) not null check (reward_flags >= 0),
  created_at timestamptz not null default now(),
  primary key (winner_date, rank, user_id)
);

-- ===== Market =====
create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  active boolean not null default true,
  seed_price numeric(18,6) not null check (seed_price > 0),
  current_price numeric(18,6) not null check (current_price > 0),
  baseline_capital numeric(18,6) not null default 0 check (baseline_capital >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.holdings (
  user_id uuid not null references public.profiles(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  units numeric(24,10) not null default 0 check (units >= 0),
  avg_cost_basis numeric(18,6) not null default 0 check (avg_cost_basis >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, player_id)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  order_type public.order_type not null,
  flags_amount numeric(18,6) check (flags_amount > 0),
  units_amount numeric(24,10) check (units_amount > 0),
  trade_date date not null,
  status public.order_status not null default 'pending',
  created_at timestamptz not null default now(),
  executed_at timestamptz,
  check (
    (order_type = 'buy' and flags_amount is not null and units_amount is null)
    or
    (order_type = 'sell' and units_amount is not null and flags_amount is null)
  )
);

create table if not exists public.daily_player_snapshots (
  snap_date date not null,
  player_id uuid not null references public.players(id) on delete cascade,
  pre_price numeric(18,6) not null,
  post_price numeric(18,6) not null,
  net_flow_flags numeric(18,6) not null default 0,
  total_units numeric(24,10) not null default 0,
  effective_capital numeric(18,6) not null default 0,
  created_at timestamptz not null default now(),
  primary key (snap_date, player_id)
);

-- ===== Audit / jobs =====
create table if not exists public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  delta_flags numeric(18,6) not null,
  reason text not null,
  ref_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.system_jobs (
  id uuid primary key default gen_random_uuid(),
  job_date date not null,
  job_type public.job_type not null,
  status public.job_status not null default 'queued',
  started_at timestamptz,
  finished_at timestamptz,
  log_json jsonb not null default '{}'::jsonb,
  unique (job_date, job_type)
);

create table if not exists public.daily_user_metrics (
  metric_date date not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  impressions int not null default 0,
  votes_cast int not null default 0,
  votes_received int not null default 0,
  net_worth_close numeric(18,6) not null default 0,
  created_at timestamptz not null default now(),
  primary key (metric_date, user_id)
);

-- ===== Helpful indexes =====
create index if not exists idx_opinions_date on public.opinions (submitted_for_date);
create index if not exists idx_assignments_viewer_date on public.opinion_assignments (viewer_user_id, assigned_for_date);
create index if not exists idx_votes_voter_date on public.opinion_votes (voter_user_id, assigned_for_date);
create index if not exists idx_orders_trade_date_status on public.orders (trade_date, status);
create index if not exists idx_holdings_user on public.holdings (user_id);

-- ===== Trigger: updated_at =====
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_wallets_updated_at on public.wallets;
create trigger trg_wallets_updated_at
before update on public.wallets
for each row execute function public.set_updated_at();

drop trigger if exists trg_players_updated_at on public.players;
create trigger trg_players_updated_at
before update on public.players
for each row execute function public.set_updated_at();

-- ===== Auto-create profile + wallet after signup =====
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  generated_username text;
begin
  generated_username := coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1));

  insert into public.profiles (id, username, email)
  values (new.id, generated_username, new.email)
  on conflict (id) do nothing;

  insert into public.wallets (user_id, liquid_flags)
  values (new.id, 100)
  on conflict (user_id) do nothing;

  insert into public.wallet_ledger (user_id, delta_flags, reason)
  values (new.id, 100, 'signup_grant')
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ===== Basic RLS =====
alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.opinions enable row level security;
alter table public.opinion_assignments enable row level security;
alter table public.opinion_votes enable row level security;
alter table public.holdings enable row level security;
alter table public.orders enable row level security;
alter table public.wallet_ledger enable row level security;
alter table public.daily_user_metrics enable row level security;

-- User can read own profile/wallet/etc.
create policy if not exists profiles_select_own on public.profiles for select using (auth.uid() = id);
create policy if not exists wallets_select_own on public.wallets for select using (auth.uid() = user_id);
create policy if not exists opinions_select_own on public.opinions for select using (auth.uid() = user_id);
create policy if not exists opinions_insert_own on public.opinions for insert with check (auth.uid() = user_id);
create policy if not exists assignments_select_own on public.opinion_assignments for select using (auth.uid() = viewer_user_id);
create policy if not exists votes_select_own on public.opinion_votes for select using (auth.uid() = voter_user_id);
create policy if not exists votes_insert_own on public.opinion_votes for insert with check (auth.uid() = voter_user_id);
create policy if not exists holdings_select_own on public.holdings for select using (auth.uid() = user_id);
create policy if not exists orders_select_own on public.orders for select using (auth.uid() = user_id);
create policy if not exists orders_insert_own on public.orders for insert with check (auth.uid() = user_id);
create policy if not exists ledger_select_own on public.wallet_ledger for select using (auth.uid() = user_id);
create policy if not exists metrics_select_own on public.daily_user_metrics for select using (auth.uid() = user_id);

-- Public read for market and winners/leaderboard inputs.
alter table public.players enable row level security;
alter table public.daily_winners enable row level security;
alter table public.daily_player_snapshots enable row level security;
alter table public.system_jobs enable row level security;

create policy if not exists players_public_read on public.players for select using (true);
create policy if not exists winners_public_read on public.daily_winners for select using (true);
create policy if not exists snapshots_public_read on public.daily_player_snapshots for select using (true);

