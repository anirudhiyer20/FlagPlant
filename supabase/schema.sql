-- FlagPlant MVP schema (Phase 1)
-- Run in Supabase SQL editor.

create extension if not exists pgcrypto;

create or replace function public.app_current_date_est()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/New_York')::date
$$;

-- ===== Enums =====
do $$ begin
  create type public.user_role as enum ('user', 'admin');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.order_type as enum ('buy', 'sell');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.order_status as enum ('pending', 'executed', 'cancelled', 'failed');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.job_type as enum ('close_compute', 'publish');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.job_status as enum ('queued', 'running', 'success', 'failed');
exception
  when duplicate_object then null;
end $$;

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

-- ===== Social graph =====
create table if not exists public.user_follows (
  follower_user_id uuid not null references public.profiles(id) on delete cascade,
  followed_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_user_id, followed_user_id),
  check (follower_user_id <> followed_user_id)
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
    (
      order_type = 'buy'
      and flags_amount is not null
      and (
        (status = 'pending' and units_amount is null)
        or
        (status = 'executed' and units_amount is not null)
        or
        (status in ('cancelled', 'failed') and units_amount is null)
      )
    )
    or
    (
      order_type = 'sell'
      and units_amount is not null
      and (
        (status = 'pending')
        or
        (status = 'executed' and flags_amount is not null)
        or
        (status in ('cancelled', 'failed'))
      )
    )
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
create index if not exists idx_user_follows_followed on public.user_follows (followed_user_id);
create index if not exists idx_user_follows_follower on public.user_follows (follower_user_id);

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
alter table public.user_follows enable row level security;

-- User can read own profile/wallet/etc.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select using (auth.uid() = id);
drop policy if exists wallets_select_own on public.wallets;
create policy wallets_select_own on public.wallets for select using (auth.uid() = user_id);
drop policy if exists opinions_select_own on public.opinions;
create policy opinions_select_own on public.opinions for select using (auth.uid() = user_id);
drop policy if exists opinions_select_assigned on public.opinions;
create policy opinions_select_assigned
on public.opinions
for select
using (
  exists (
    select 1
    from public.opinion_assignments oa
    where oa.opinion_id = opinions.id
      and oa.viewer_user_id = auth.uid()
      and oa.assigned_for_date = (opinions.submitted_for_date + 1)
  )
);
drop policy if exists opinions_insert_own on public.opinions;
create policy opinions_insert_own
on public.opinions
for insert
with check (
  auth.uid() = user_id
  and submitted_for_date = public.app_current_date_est()
);
drop policy if exists assignments_select_own on public.opinion_assignments;
create policy assignments_select_own on public.opinion_assignments for select using (auth.uid() = viewer_user_id);
drop policy if exists votes_select_own on public.opinion_votes;
create policy votes_select_own on public.opinion_votes for select using (auth.uid() = voter_user_id);
drop policy if exists votes_insert_own on public.opinion_votes;
create policy votes_insert_own
on public.opinion_votes
for insert
with check (
  auth.uid() = voter_user_id
  and assigned_for_date = public.app_current_date_est()
  and exists (
    select 1
    from public.opinion_assignments oa
    where oa.opinion_id = opinion_votes.opinion_id
      and oa.viewer_user_id = auth.uid()
      and oa.assigned_for_date = opinion_votes.assigned_for_date
  )
);
drop policy if exists holdings_select_own on public.holdings;
create policy holdings_select_own on public.holdings for select using (auth.uid() = user_id);
drop policy if exists orders_select_own on public.orders;
create policy orders_select_own on public.orders for select using (auth.uid() = user_id);
drop policy if exists orders_insert_own on public.orders;
create policy orders_insert_own
on public.orders
for insert
with check (
  auth.uid() = user_id
  and (
    (
      order_type = 'buy'
      and flags_amount is not null
      and flags_amount <= (
        coalesce(
          (
            select w.liquid_flags
            from public.wallets w
            where w.user_id = auth.uid()
          ),
          0::numeric
        )
        - coalesce(
          (
            select sum(o.flags_amount)
            from public.orders o
            where o.user_id = auth.uid()
              and o.order_type = 'buy'
              and o.status = 'pending'
          ),
          0::numeric
        )
      )
    )
    or
    (
      order_type = 'sell'
      and units_amount is not null
      and units_amount <= (
        coalesce(
          (
            select h.units
            from public.holdings h
            where h.user_id = auth.uid()
              and h.player_id = orders.player_id
          ),
          0::numeric
        )
        - coalesce(
          (
            select sum(o.units_amount)
            from public.orders o
            where o.user_id = auth.uid()
              and o.player_id = orders.player_id
              and o.order_type = 'sell'
              and o.status = 'pending'
          ),
          0::numeric
        )
      )
    )
  )
);
drop policy if exists ledger_select_own on public.wallet_ledger;
create policy ledger_select_own on public.wallet_ledger for select using (auth.uid() = user_id);
drop policy if exists metrics_select_own on public.daily_user_metrics;
create policy metrics_select_own on public.daily_user_metrics for select using (auth.uid() = user_id);
drop policy if exists follows_select_involved on public.user_follows;
create policy follows_select_involved
on public.user_follows
for select
using (
  auth.uid() = follower_user_id
  or auth.uid() = followed_user_id
);
drop policy if exists follows_insert_own on public.user_follows;
create policy follows_insert_own
on public.user_follows
for insert
with check (
  auth.uid() = follower_user_id
  and follower_user_id <> followed_user_id
);
drop policy if exists follows_delete_own on public.user_follows;
create policy follows_delete_own
on public.user_follows
for delete
using (auth.uid() = follower_user_id);

-- Public read for market and winners/leaderboard inputs.
alter table public.players enable row level security;
alter table public.daily_winners enable row level security;
alter table public.daily_player_snapshots enable row level security;
alter table public.system_jobs enable row level security;

drop policy if exists players_public_read on public.players;
create policy players_public_read on public.players for select using (true);
drop policy if exists winners_public_read on public.daily_winners;
create policy winners_public_read on public.daily_winners for select using (true);
drop policy if exists snapshots_public_read on public.daily_player_snapshots;
create policy snapshots_public_read on public.daily_player_snapshots for select using (true);

create or replace function public.get_follow_state(target_user_id uuid)
returns table (
  result_target_user_id uuid,
  result_is_following boolean,
  result_follows_you boolean,
  result_follower_count int,
  result_following_count int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  return query
  select
    target_user_id as result_target_user_id,
    exists (
      select 1
      from public.user_follows uf
      where uf.follower_user_id = auth.uid()
        and uf.followed_user_id = target_user_id
    ) as result_is_following,
    exists (
      select 1
      from public.user_follows uf
      where uf.follower_user_id = target_user_id
        and uf.followed_user_id = auth.uid()
    ) as result_follows_you,
    (
      select count(*)::int
      from public.user_follows uf
      where uf.followed_user_id = target_user_id
    ) as result_follower_count,
    (
      select count(*)::int
      from public.user_follows uf
      where uf.follower_user_id = target_user_id
    ) as result_following_count;
end;
$$;

create or replace function public.follow_user(target_user_id uuid)
returns table (
  result_target_user_id uuid,
  result_following boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if target_user_id is null then
    raise exception 'Target user id is required';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'Cannot follow yourself';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = target_user_id
  ) then
    raise exception 'Target user does not exist';
  end if;

  insert into public.user_follows (follower_user_id, followed_user_id)
  values (auth.uid(), target_user_id)
  on conflict (follower_user_id, followed_user_id) do nothing;

  return query
  select target_user_id, true;
end;
$$;

create or replace function public.unfollow_user(target_user_id uuid)
returns table (
  result_target_user_id uuid,
  result_following boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if target_user_id is null then
    raise exception 'Target user id is required';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'Cannot unfollow yourself';
  end if;

  delete from public.user_follows uf
  where uf.follower_user_id = auth.uid()
    and uf.followed_user_id = target_user_id;

  return query
  select target_user_id, false;
end;
$$;

create or replace function public.get_follow_list(
  target_user_id uuid,
  list_kind text default 'following',
  limit_count int default 25
)
returns table (
  result_user_id uuid,
  result_username text,
  result_followed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  clamped_limit int;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  clamped_limit := greatest(1, least(coalesce(limit_count, 25), 100));

  if list_kind = 'followers' then
    return query
    select
      uf.follower_user_id as result_user_id,
      p.username as result_username,
      uf.created_at as result_followed_at
    from public.user_follows uf
    join public.profiles p on p.id = uf.follower_user_id
    where uf.followed_user_id = target_user_id
    order by uf.created_at desc, p.username asc
    limit clamped_limit;
    return;
  end if;

  if list_kind = 'following' then
    return query
    select
      uf.followed_user_id as result_user_id,
      p.username as result_username,
      uf.created_at as result_followed_at
    from public.user_follows uf
    join public.profiles p on p.id = uf.followed_user_id
    where uf.follower_user_id = target_user_id
    order by uf.created_at desc, p.username asc
    limit clamped_limit;
    return;
  end if;

  raise exception 'Invalid list_kind: %, expected followers or following', list_kind;
end;
$$;

revoke all on function public.get_follow_state(uuid) from public;
grant execute on function public.get_follow_state(uuid) to authenticated;

revoke all on function public.follow_user(uuid) from public;
grant execute on function public.follow_user(uuid) to authenticated;

revoke all on function public.unfollow_user(uuid) from public;
grant execute on function public.unfollow_user(uuid) to authenticated;

revoke all on function public.get_follow_list(uuid, text, int) from public;
grant execute on function public.get_follow_list(uuid, text, int) to authenticated;

create or replace function public.get_player_market_stats()
returns table (
  result_player_id uuid,
  result_holder_count int,
  result_invested_capital numeric(18,6)
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    p.id as result_player_id,
    count(h.user_id)::int as result_holder_count,
    coalesce(sum(h.units * p.current_price), 0::numeric)::numeric(18,6) as result_invested_capital
  from public.players p
  left join public.holdings h
    on h.player_id = p.id
    and h.units > 0.005::numeric
  group by p.id
  order by p.id;
end;
$$;

revoke all on function public.get_player_market_stats() from public;
grant execute on function public.get_player_market_stats() to authenticated;

create or replace function public.get_leaderboard_snapshot()
returns table (
  result_rank int,
  result_user_id uuid,
  result_username text,
  result_liquid_flags numeric(18,6),
  result_holdings_value numeric(18,6),
  result_net_worth numeric(18,6),
  result_holding_count int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with holdings_agg as (
    select
      h.user_id,
      count(*)::int as holding_count,
      coalesce(sum(h.units * p.current_price), 0::numeric)::numeric(18,6) as holdings_value
    from public.holdings h
    join public.players p on p.id = h.player_id
    where h.units > 0.005::numeric
    group by h.user_id
  ),
  base as (
    select
      pr.id as user_id,
      pr.username,
      coalesce(w.liquid_flags, 0::numeric)::numeric(18,6) as liquid_flags,
      coalesce(ha.holdings_value, 0::numeric)::numeric(18,6) as holdings_value,
      coalesce(ha.holding_count, 0)::int as holding_count,
      (
        coalesce(w.liquid_flags, 0::numeric)
        + coalesce(ha.holdings_value, 0::numeric)
      )::numeric(18,6) as net_worth
    from public.profiles pr
    left join public.wallets w on w.user_id = pr.id
    left join holdings_agg ha on ha.user_id = pr.id
  ),
  ranked as (
    select
      dense_rank() over (
        order by b.net_worth desc, b.username asc, b.user_id asc
      )::int as rank,
      b.user_id,
      b.username,
      b.liquid_flags,
      b.holdings_value,
      b.net_worth,
      b.holding_count
    from base b
  )
  select
    r.rank as result_rank,
    r.user_id as result_user_id,
    r.username as result_username,
    r.liquid_flags as result_liquid_flags,
    r.holdings_value as result_holdings_value,
    r.net_worth as result_net_worth,
    r.holding_count as result_holding_count
  from ranked r
  order by r.rank asc, r.username asc;
end;
$$;

revoke all on function public.get_leaderboard_snapshot() from public;
grant execute on function public.get_leaderboard_snapshot() to authenticated;

create or replace function public.get_leaderboard_snapshot_scoped(
  view_mode text default 'global'
)
returns table (
  result_rank int,
  result_user_id uuid,
  result_username text,
  result_liquid_flags numeric(18,6),
  result_holdings_value numeric(18,6),
  result_net_worth numeric(18,6),
  result_holding_count int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_mode text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  normalized_mode := lower(coalesce(view_mode, 'global'));
  if normalized_mode not in ('global', 'friends_only') then
    raise exception 'Invalid view_mode: %, expected global or friends_only', view_mode;
  end if;

  return query
  with holdings_agg as (
    select
      h.user_id,
      count(*)::int as holding_count,
      coalesce(sum(h.units * p.current_price), 0::numeric)::numeric(18,6) as holdings_value
    from public.holdings h
    join public.players p on p.id = h.player_id
    where h.units > 0.005::numeric
    group by h.user_id
  ),
  base as (
    select
      pr.id as user_id,
      pr.username,
      coalesce(w.liquid_flags, 0::numeric)::numeric(18,6) as liquid_flags,
      coalesce(ha.holdings_value, 0::numeric)::numeric(18,6) as holdings_value,
      coalesce(ha.holding_count, 0)::int as holding_count,
      (
        coalesce(w.liquid_flags, 0::numeric)
        + coalesce(ha.holdings_value, 0::numeric)
      )::numeric(18,6) as net_worth
    from public.profiles pr
    left join public.wallets w on w.user_id = pr.id
    left join holdings_agg ha on ha.user_id = pr.id
  ),
  mutual_friends as (
    select uf.followed_user_id as user_id
    from public.user_follows uf
    join public.user_follows uf_back
      on uf_back.follower_user_id = uf.followed_user_id
      and uf_back.followed_user_id = uf.follower_user_id
    where uf.follower_user_id = auth.uid()
  ),
  scoped as (
    select b.*
    from base b
    where normalized_mode = 'global'
      or b.user_id = auth.uid()
      or exists (
        select 1
        from mutual_friends mf
        where mf.user_id = b.user_id
      )
  ),
  ranked as (
    select
      dense_rank() over (
        order by s.net_worth desc, s.username asc, s.user_id asc
      )::int as rank,
      s.user_id,
      s.username,
      s.liquid_flags,
      s.holdings_value,
      s.net_worth,
      s.holding_count
    from scoped s
  )
  select
    r.rank as result_rank,
    r.user_id as result_user_id,
    r.username as result_username,
    r.liquid_flags as result_liquid_flags,
    r.holdings_value as result_holdings_value,
    r.net_worth as result_net_worth,
    r.holding_count as result_holding_count
  from ranked r
  order by r.rank asc, r.username asc;
end;
$$;

revoke all on function public.get_leaderboard_snapshot_scoped(text) from public;
grant execute on function public.get_leaderboard_snapshot_scoped(text) to authenticated;

create or replace function public.get_public_profile_snapshot(target_user_id uuid)
returns table (
  result_user_id uuid,
  result_username text,
  result_liquid_flags numeric(18,6),
  result_holdings_value numeric(18,6),
  result_holdings_cost_basis numeric(18,6),
  result_unrealized_pnl numeric(18,6),
  result_unrealized_return_pct numeric(18,6),
  result_net_worth numeric(18,6),
  result_liquid_share_pct numeric(18,6),
  result_invested_share_pct numeric(18,6),
  result_holding_count int,
  result_top_holding_player_name text,
  result_top_holding_value numeric(18,6),
  result_latest_winner_date date,
  result_latest_winner_rank int,
  result_latest_winner_votes int,
  result_latest_winner_reward_flags numeric(18,6),
  result_latest_winner_opinion text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  return query
  with holdings_rows as (
    select
      h.player_id,
      p.name as player_name,
      h.units,
      h.avg_cost_basis,
      p.current_price,
      (h.units * h.avg_cost_basis)::numeric(18,6) as cost_basis_value,
      (h.units * p.current_price)::numeric(18,6) as market_value
    from public.holdings h
    join public.players p on p.id = h.player_id
    where h.user_id = target_user_id
      and h.units > 0.005::numeric
  ),
  holdings_agg as (
    select
      count(*)::int as holding_count,
      coalesce(sum(hr.cost_basis_value), 0::numeric)::numeric(18,6) as holdings_cost_basis,
      coalesce(sum(hr.market_value), 0::numeric)::numeric(18,6) as holdings_value
    from holdings_rows hr
  ),
  top_holding as (
    select
      hr.player_name,
      hr.market_value
    from holdings_rows hr
    order by hr.market_value desc, hr.player_name asc
    limit 1
  ),
  latest_winner as (
    select
      dw.winner_date,
      dw.rank,
      dw.votes_received,
      dw.reward_flags,
      o.body as opinion_body
    from public.daily_winners dw
    left join public.opinions o on o.id = dw.opinion_id
    where dw.user_id = target_user_id
    order by dw.winner_date desc, dw.rank asc
    limit 1
  )
  select
    pr.id as result_user_id,
    pr.username as result_username,
    coalesce(w.liquid_flags, 0::numeric)::numeric(18,6) as result_liquid_flags,
    ha.holdings_value as result_holdings_value,
    ha.holdings_cost_basis as result_holdings_cost_basis,
    (ha.holdings_value - ha.holdings_cost_basis)::numeric(18,6) as result_unrealized_pnl,
    case
      when ha.holdings_cost_basis > 0
      then round(((ha.holdings_value - ha.holdings_cost_basis) / ha.holdings_cost_basis) * 100::numeric, 6)
      else null::numeric(18,6)
    end as result_unrealized_return_pct,
    (coalesce(w.liquid_flags, 0::numeric) + ha.holdings_value)::numeric(18,6) as result_net_worth,
    case
      when (coalesce(w.liquid_flags, 0::numeric) + ha.holdings_value) > 0
      then round((coalesce(w.liquid_flags, 0::numeric) / (coalesce(w.liquid_flags, 0::numeric) + ha.holdings_value)) * 100::numeric, 6)
      else null::numeric(18,6)
    end as result_liquid_share_pct,
    case
      when (coalesce(w.liquid_flags, 0::numeric) + ha.holdings_value) > 0
      then round((ha.holdings_value / (coalesce(w.liquid_flags, 0::numeric) + ha.holdings_value)) * 100::numeric, 6)
      else null::numeric(18,6)
    end as result_invested_share_pct,
    ha.holding_count as result_holding_count,
    th.player_name as result_top_holding_player_name,
    th.market_value as result_top_holding_value,
    lw.winner_date as result_latest_winner_date,
    lw.rank as result_latest_winner_rank,
    lw.votes_received as result_latest_winner_votes,
    lw.reward_flags as result_latest_winner_reward_flags,
    lw.opinion_body as result_latest_winner_opinion
  from public.profiles pr
  left join public.wallets w on w.user_id = pr.id
  cross join holdings_agg ha
  left join top_holding th on true
  left join latest_winner lw on true
  where pr.id = target_user_id;
end;
$$;

create or replace function public.get_public_profile_holdings(target_user_id uuid)
returns table (
  result_player_id uuid,
  result_player_name text,
  result_units numeric(24,10),
  result_avg_cost_basis numeric(18,6),
  result_current_price numeric(18,6),
  result_cost_basis_value numeric(18,6),
  result_market_value numeric(18,6),
  result_unrealized_pnl numeric(18,6)
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  return query
  select
    h.player_id as result_player_id,
    p.name as result_player_name,
    h.units as result_units,
    h.avg_cost_basis as result_avg_cost_basis,
    p.current_price as result_current_price,
    (h.units * h.avg_cost_basis)::numeric(18,6) as result_cost_basis_value,
    (h.units * p.current_price)::numeric(18,6) as result_market_value,
    (h.units * (p.current_price - h.avg_cost_basis))::numeric(18,6) as result_unrealized_pnl
  from public.holdings h
  join public.players p on p.id = h.player_id
  where h.user_id = target_user_id
    and h.units > 0.005::numeric
  order by result_market_value desc, result_player_name asc;
end;
$$;

revoke all on function public.get_public_profile_snapshot(uuid) from public;
grant execute on function public.get_public_profile_snapshot(uuid) to authenticated;

revoke all on function public.get_public_profile_holdings(uuid) from public;
grant execute on function public.get_public_profile_holdings(uuid) to authenticated;

create or replace function public.get_recent_winner_boards(limit_days int default 14)
returns table (
  result_winner_date date,
  result_rank int,
  result_user_id uuid,
  result_username text,
  result_opinion_id uuid,
  result_opinion_body text,
  result_votes_received int,
  result_reward_flags numeric(18,6)
)
language plpgsql
security definer
set search_path = public
as $$
declare
  clamped_days int;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  clamped_days := greatest(1, least(coalesce(limit_days, 14), 90));

  return query
  with recent_dates as (
    select distinct dw.winner_date
    from public.daily_winners dw
    order by dw.winner_date desc
    limit clamped_days
  )
  select
    dw.winner_date as result_winner_date,
    dw.rank as result_rank,
    dw.user_id as result_user_id,
    p.username as result_username,
    dw.opinion_id as result_opinion_id,
    o.body as result_opinion_body,
    dw.votes_received as result_votes_received,
    dw.reward_flags as result_reward_flags
  from public.daily_winners dw
  join recent_dates rd on rd.winner_date = dw.winner_date
  join public.profiles p on p.id = dw.user_id
  left join public.opinions o on o.id = dw.opinion_id
  order by dw.winner_date desc, dw.rank asc;
end;
$$;

revoke all on function public.get_recent_winner_boards(int) from public;
grant execute on function public.get_recent_winner_boards(int) to authenticated;

create or replace function public.get_user_portfolio_history(
  target_user_id uuid,
  lookback_days int default 30
)
returns table (
  result_snap_date date,
  result_unplanted_flags_close numeric(18,6),
  result_planted_value_close numeric(18,6),
  result_total_value_close numeric(18,6),
  result_holdings_json jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  clamped_days int;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  clamped_days := greatest(1, least(coalesce(lookback_days, 30), 120));

  return query
  with date_window as (
    select generate_series(
      (public.app_current_date_est() - (clamped_days - 1))::timestamp,
      public.app_current_date_est()::timestamp,
      interval '1 day'
    )::date as snap_date
  ),
  order_deltas as (
    select
      o.trade_date as snap_date,
      o.player_id,
      sum(
        case
          when o.order_type = 'buy' then coalesce(o.units_amount, 0::numeric)
          when o.order_type = 'sell' then -coalesce(o.units_amount, 0::numeric)
          else 0::numeric
        end
      )::numeric(24,10) as delta_units
    from public.orders o
    where o.user_id = target_user_id
      and o.status = 'executed'
      and o.units_amount is not null
    group by o.trade_date, o.player_id
  ),
  player_ids as (
    select distinct od.player_id
    from order_deltas od
  ),
  positions_by_day as (
    select
      dw.snap_date,
      pid.player_id,
      sum(coalesce(od.delta_units, 0::numeric)) over (
        partition by pid.player_id
        order by dw.snap_date
        rows between unbounded preceding and current row
      )::numeric(24,10) as units_close
    from date_window dw
    cross join player_ids pid
    left join order_deltas od
      on od.snap_date = dw.snap_date
      and od.player_id = pid.player_id
  ),
  holdings_details as (
    select
      pbd.snap_date,
      p.name as player_name,
      pbd.units_close,
      (
        pbd.units_close
        * (
          case
            when pbd.snap_date = public.app_current_date_est() then p.current_price
            else coalesce(
              (
                select dps.post_price
                from public.daily_player_snapshots dps
                where dps.player_id = pbd.player_id
                  and dps.snap_date <= pbd.snap_date
                order by dps.snap_date desc
                limit 1
              ),
              p.seed_price
            )
          end
        )
      )::numeric(18,6) as market_value
    from positions_by_day pbd
    join public.players p on p.id = pbd.player_id
    where pbd.units_close > 0.005::numeric
  ),
  holdings_agg as (
    select
      hd.snap_date,
      coalesce(sum(hd.market_value), 0::numeric)::numeric(18,6) as planted_value_close,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'player_name', hd.player_name,
            'units', round(hd.units_close, 6),
            'value', round(hd.market_value, 6)
          )
          order by hd.market_value desc, hd.player_name asc
        ),
        '[]'::jsonb
      ) as holdings_json
    from holdings_details hd
    group by hd.snap_date
  ),
  unplanted_by_day as (
    select
      dw.snap_date,
      coalesce(
        (
          select sum(wl.delta_flags)
          from public.wallet_ledger wl
          where wl.user_id = target_user_id
            and (wl.created_at at time zone 'America/New_York')::date <= dw.snap_date
        ),
        0::numeric
      )::numeric(18,6) as unplanted_flags_close
    from date_window dw
  )
  select
    dw.snap_date as result_snap_date,
    ubd.unplanted_flags_close as result_unplanted_flags_close,
    coalesce(ha.planted_value_close, 0::numeric)::numeric(18,6) as result_planted_value_close,
    (ubd.unplanted_flags_close + coalesce(ha.planted_value_close, 0::numeric))::numeric(18,6) as result_total_value_close,
    coalesce(ha.holdings_json, '[]'::jsonb) as result_holdings_json
  from date_window dw
  join unplanted_by_day ubd on ubd.snap_date = dw.snap_date
  left join holdings_agg ha on ha.snap_date = dw.snap_date
  order by dw.snap_date asc;
end;
$$;

revoke all on function public.get_user_portfolio_history(uuid, int) from public;
grant execute on function public.get_user_portfolio_history(uuid, int) to authenticated;

-- ===== Admin winner compute/publish RPC =====
create or replace function public.assert_admin()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role public.user_role;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select p.role
  into caller_role
  from public.profiles p
  where p.id = auth.uid();

  if caller_role is distinct from 'admin' then
    raise exception 'Admin access required';
  end if;
end;
$$;

create or replace function public.get_daily_winner_preview(target_date date default public.app_current_date_est())
returns table (
  rank int,
  user_id uuid,
  username text,
  opinion_id uuid,
  votes_received int,
  reward_flags numeric(18,6)
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  source_opinion_date date;
begin
  perform public.assert_admin();
  source_opinion_date := target_date - 1;

  return query
  with reward_schedule as (
    select *
    from (values
      (1, 50::numeric(18,6)),
      (2, 30::numeric(18,6)),
      (3, 20::numeric(18,6)),
      (4, 10::numeric(18,6)),
      (5, 5::numeric(18,6))
    ) as rs(pos, reward)
  ),
  vote_totals as (
    select
      o.id as opinion_id,
      o.user_id,
      count(v.id)::int as votes_received,
      row_number() over (
        order by count(v.id) desc, o.created_at asc, o.id asc
      )::int as row_pos
    from public.opinions o
    left join public.opinion_votes v
      on v.opinion_id = o.id
      and v.assigned_for_date = target_date
    where o.submitted_for_date = source_opinion_date
      and o.status = 'active'
    group by o.id, o.user_id, o.created_at
  ),
  top_five as (
    select vt.*
    from vote_totals vt
    where vt.row_pos <= 5
  ),
  tie_groups as (
    select
      tf.*,
      dense_rank() over (order by tf.votes_received desc)::int as tie_group
    from top_five tf
  ),
  grouped as (
    select
      tg.*,
      min(tg.row_pos) over (partition by tg.tie_group)::int as group_min_pos,
      max(tg.row_pos) over (partition by tg.tie_group)::int as group_max_pos,
      count(*) over (partition by tg.tie_group)::int as group_size
    from tie_groups tg
  ),
  reward_pool as (
    select
      g.*,
      (
        select coalesce(sum(rs.reward), 0::numeric(18,6))
        from reward_schedule rs
        where rs.pos between g.group_min_pos and g.group_max_pos
      ) as group_reward_pool
    from grouped g
  )
  select
    g.row_pos as rank,
    g.user_id,
    p.username,
    g.opinion_id,
    g.votes_received,
    round(g.group_reward_pool / g.group_size::numeric, 6) as reward_flags
  from reward_pool g
  join public.profiles p on p.id = g.user_id
  order by g.row_pos;
end;
$$;

create or replace function public.admin_publish_daily_winners(target_date date default public.app_current_date_est())
returns table (
  rank int,
  user_id uuid,
  username text,
  opinion_id uuid,
  votes_received int,
  reward_flags numeric(18,6)
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin();

  if exists (
    select 1
    from public.daily_winners dw
    where dw.winner_date = target_date
  ) then
    raise exception 'Winners already published for %', target_date;
  end if;

  return query
  with preview as (
    select *
    from public.get_daily_winner_preview(target_date)
  ),
  inserted as (
    insert into public.daily_winners as dw (
      winner_date,
      rank,
      user_id,
      opinion_id,
      votes_received,
      reward_flags
    )
    select
      target_date,
      p.rank,
      p.user_id,
      p.opinion_id,
      p.votes_received,
      p.reward_flags
    from preview p
    returning
      dw.rank,
      dw.user_id,
      dw.opinion_id,
      dw.votes_received,
      dw.reward_flags
  ),
  wallet_updates as (
    update public.wallets w
    set liquid_flags = w.liquid_flags + i.reward_flags
    from inserted i
    where w.user_id = i.user_id
    returning i.user_id, i.opinion_id, i.reward_flags
  ),
  ledger_rows as (
    insert into public.wallet_ledger (user_id, delta_flags, reason, ref_id)
    select
      wu.user_id,
      wu.reward_flags,
      'daily_winner_reward',
      wu.opinion_id
    from wallet_updates wu
    returning id
  )
  select
    i.rank,
    i.user_id,
    p.username,
    i.opinion_id,
    i.votes_received,
    i.reward_flags
  from inserted i
  join public.profiles p on p.id = i.user_id
  order by i.rank;
end;
$$;

revoke all on function public.assert_admin() from public;
grant execute on function public.assert_admin() to authenticated;

revoke all on function public.get_daily_winner_preview(date) from public;
grant execute on function public.get_daily_winner_preview(date) to authenticated;

revoke all on function public.admin_publish_daily_winners(date) from public;
grant execute on function public.admin_publish_daily_winners(date) to authenticated;

create or replace function public.admin_preview_pending_buy_orders(target_date date default public.app_current_date_est())
returns table (
  result_user_id uuid,
  result_username text,
  result_pending_order_count int,
  result_pending_flags_total numeric(18,6)
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin();

  return query
  select
    o.user_id,
    p.username,
    count(*)::int as pending_order_count,
    coalesce(sum(o.flags_amount), 0::numeric(18,6)) as pending_flags_total
  from public.orders o
  join public.profiles p on p.id = o.user_id
  where o.trade_date = target_date
    and o.order_type = 'buy'
    and o.status = 'pending'
  group by o.user_id, p.username
  order by pending_flags_total desc, pending_order_count desc;
end;
$$;

create or replace function public.admin_preview_pending_sell_orders(target_date date default public.app_current_date_est())
returns table (
  result_user_id uuid,
  result_username text,
  result_pending_order_count int,
  result_pending_units_total numeric(24,10),
  result_estimated_flags_total numeric(18,6)
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin();

  return query
  select
    o.user_id,
    p.username,
    count(*)::int as pending_order_count,
    coalesce(sum(o.units_amount), 0::numeric(24,10)) as pending_units_total,
    coalesce(sum(o.units_amount * pl.current_price), 0::numeric(18,6)) as estimated_flags_total
  from public.orders o
  join public.profiles p on p.id = o.user_id
  join public.players pl on pl.id = o.player_id
  where o.trade_date = target_date
    and o.order_type = 'sell'
    and o.status = 'pending'
  group by o.user_id, p.username
  order by estimated_flags_total desc, pending_order_count desc;
end;
$$;

create or replace function public.admin_execute_pending_buy_orders(target_date date default public.app_current_date_est())
returns table (
  result_order_id uuid,
  result_user_id uuid,
  result_player_id uuid,
  result_status public.order_status,
  result_flags_amount numeric(18,6),
  result_units_amount numeric(24,10),
  result_note text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_wallet numeric(18,6);
  v_price numeric(18,6);
  v_active boolean;
  v_units numeric(24,10);
  v_updated_rows int;
begin
  perform public.assert_admin();

  for rec in
    select
      o.id,
      o.user_id,
      o.player_id,
      o.flags_amount
    from public.orders o
    where o.trade_date = target_date
      and o.order_type = 'buy'
      and o.status = 'pending'
    order by o.created_at asc, o.id asc
    for update skip locked
  loop
    select w.liquid_flags
    into v_wallet
    from public.wallets w
    where w.user_id = rec.user_id
    for update;

    select p.current_price, p.active
    into v_price, v_active
    from public.players p
    where p.id = rec.player_id;

    if v_wallet is null then
      update public.orders o
      set status = 'failed', executed_at = now()
      where o.id = rec.id and o.status = 'pending';

      return query
      select
        rec.id,
        rec.user_id,
        rec.player_id,
        'failed'::public.order_status,
        rec.flags_amount,
        null::numeric(24,10),
        'wallet_missing'::text;

      continue;
    end if;

    if v_price is null or coalesce(v_active, false) = false then
      update public.orders o
      set status = 'failed', executed_at = now()
      where o.id = rec.id and o.status = 'pending';

      return query
      select
        rec.id,
        rec.user_id,
        rec.player_id,
        'failed'::public.order_status,
        rec.flags_amount,
        null::numeric(24,10),
        'player_unavailable'::text;

      continue;
    end if;

    if rec.flags_amount is null or rec.flags_amount <= 0 then
      update public.orders o
      set status = 'failed', executed_at = now()
      where o.id = rec.id and o.status = 'pending';

      return query
      select
        rec.id,
        rec.user_id,
        rec.player_id,
        'failed'::public.order_status,
        rec.flags_amount,
        null::numeric(24,10),
        'invalid_flags_amount'::text;

      continue;
    end if;

    if rec.flags_amount > v_wallet then
      update public.orders o
      set status = 'failed', executed_at = now()
      where o.id = rec.id and o.status = 'pending';

      return query
      select
        rec.id,
        rec.user_id,
        rec.player_id,
        'failed'::public.order_status,
        rec.flags_amount,
        null::numeric(24,10),
        'insufficient_wallet_at_execution'::text;

      continue;
    end if;

    v_units := (rec.flags_amount / v_price)::numeric(24,10);

    update public.wallets w
    set liquid_flags = w.liquid_flags - rec.flags_amount,
        updated_at = now()
    where w.user_id = rec.user_id;

    insert into public.holdings as h (
      user_id,
      player_id,
      units,
      avg_cost_basis,
      updated_at
    )
    values (
      rec.user_id,
      rec.player_id,
      v_units,
      v_price,
      now()
    )
    on conflict (user_id, player_id) do update set
      units = h.units + excluded.units,
      avg_cost_basis =
        case
          when (h.units + excluded.units) = 0 then 0
          else (
            (h.units * h.avg_cost_basis)
            + (excluded.units * excluded.avg_cost_basis)
          ) / (h.units + excluded.units)
        end,
      updated_at = now();

    update public.orders o
    set
      status = 'executed',
      units_amount = v_units,
      executed_at = now()
    where o.id = rec.id and o.status = 'pending';

    get diagnostics v_updated_rows = row_count;
    if v_updated_rows = 0 then
      return query
      select
        rec.id,
        rec.user_id,
        rec.player_id,
        'failed'::public.order_status,
        rec.flags_amount,
        null::numeric(24,10),
        'order_no_longer_pending'::text;

      continue;
    end if;

    insert into public.wallet_ledger (user_id, delta_flags, reason, ref_id)
    values (
      rec.user_id,
      -rec.flags_amount,
      'buy_order_execute',
      rec.id
    );

    return query
    select
      rec.id,
      rec.user_id,
      rec.player_id,
      'executed'::public.order_status,
      rec.flags_amount,
      v_units,
      'executed'::text;
  end loop;
end;
$$;

create or replace function public.admin_execute_pending_sell_orders(target_date date default public.app_current_date_est())
returns table (
  result_order_id uuid,
  result_user_id uuid,
  result_player_id uuid,
  result_status public.order_status,
  result_flags_amount numeric(18,6),
  result_units_amount numeric(24,10),
  result_note text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_wallet numeric(18,6);
  v_price numeric(18,6);
  v_active boolean;
  v_holding_units numeric(24,10);
  v_proceeds numeric(18,6);
  v_updated_rows int;
begin
  perform public.assert_admin();

  for rec in
    select
      o.id,
      o.user_id,
      o.player_id,
      o.flags_amount,
      o.units_amount
    from public.orders o
    where o.trade_date = target_date
      and o.order_type = 'sell'
      and o.status = 'pending'
    order by o.created_at asc, o.id asc
    for update skip locked
  loop
    select w.liquid_flags
    into v_wallet
    from public.wallets w
    where w.user_id = rec.user_id
    for update;

    select p.current_price, p.active
    into v_price, v_active
    from public.players p
    where p.id = rec.player_id;

    if v_wallet is null then
      update public.orders o
      set status = 'failed', executed_at = now()
      where o.id = rec.id and o.status = 'pending';

      return query
      select
        rec.id,
        rec.user_id,
        rec.player_id,
        'failed'::public.order_status,
        rec.flags_amount,
        rec.units_amount,
        'wallet_missing'::text;

      continue;
    end if;

    if v_price is null or coalesce(v_active, false) = false then
      update public.orders o
      set status = 'failed', executed_at = now()
      where o.id = rec.id and o.status = 'pending';

      return query
      select
        rec.id,
        rec.user_id,
        rec.player_id,
        'failed'::public.order_status,
        rec.flags_amount,
        rec.units_amount,
        'player_unavailable'::text;

      continue;
    end if;

    if rec.units_amount is null or rec.units_amount <= 0 then
      update public.orders o
      set status = 'failed', executed_at = now()
      where o.id = rec.id and o.status = 'pending';

      return query
      select
        rec.id,
        rec.user_id,
        rec.player_id,
        'failed'::public.order_status,
        rec.flags_amount,
        rec.units_amount,
        'invalid_units_amount'::text;

      continue;
    end if;

    select h.units
    into v_holding_units
    from public.holdings h
    where h.user_id = rec.user_id
      and h.player_id = rec.player_id
    for update;

    if v_holding_units is null or rec.units_amount > v_holding_units then
      update public.orders o
      set status = 'failed', executed_at = now()
      where o.id = rec.id and o.status = 'pending';

      return query
      select
        rec.id,
        rec.user_id,
        rec.player_id,
        'failed'::public.order_status,
        rec.flags_amount,
        rec.units_amount,
        'insufficient_units_at_execution'::text;

      continue;
    end if;

    v_proceeds := round((rec.units_amount * v_price)::numeric, 6)::numeric(18,6);

    update public.holdings h
    set
      units = h.units - rec.units_amount,
      avg_cost_basis =
        case
          when (h.units - rec.units_amount) <= 0 then 0
          else h.avg_cost_basis
        end,
      updated_at = now()
    where h.user_id = rec.user_id
      and h.player_id = rec.player_id;

    delete from public.holdings h
    where h.user_id = rec.user_id
      and h.player_id = rec.player_id
      and h.units <= 0.005::numeric;

    update public.wallets w
    set liquid_flags = w.liquid_flags + v_proceeds,
        updated_at = now()
    where w.user_id = rec.user_id;

    update public.orders o
    set
      status = 'executed',
      flags_amount = v_proceeds,
      executed_at = now()
    where o.id = rec.id and o.status = 'pending';

    get diagnostics v_updated_rows = row_count;
    if v_updated_rows = 0 then
      return query
      select
        rec.id,
        rec.user_id,
        rec.player_id,
        'failed'::public.order_status,
        rec.flags_amount,
        rec.units_amount,
        'order_no_longer_pending'::text;

      continue;
    end if;

    insert into public.wallet_ledger (user_id, delta_flags, reason, ref_id)
    values (
      rec.user_id,
      v_proceeds,
      'sell_order_execute',
      rec.id
    );

    return query
    select
      rec.id,
      rec.user_id,
      rec.player_id,
      'executed'::public.order_status,
      v_proceeds,
      rec.units_amount,
      'executed'::text;
  end loop;
end;
$$;

create or replace function public.cancel_pending_order(target_order_id uuid)
returns table (
  result_order_id uuid,
  result_deleted boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated_count int;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if target_order_id is null then
    raise exception 'Target order id is required';
  end if;

  update public.orders o
  set
    status = 'cancelled',
    executed_at = now()
  where o.id = target_order_id
    and o.user_id = auth.uid()
    and o.status = 'pending';

  get diagnostics v_updated_count = row_count;

  return query
  select
    target_order_id as result_order_id,
    (v_updated_count > 0) as result_deleted;
end;
$$;

revoke all on function public.admin_preview_pending_buy_orders(date) from public;
grant execute on function public.admin_preview_pending_buy_orders(date) to authenticated;

revoke all on function public.admin_preview_pending_sell_orders(date) from public;
grant execute on function public.admin_preview_pending_sell_orders(date) to authenticated;

revoke all on function public.admin_execute_pending_buy_orders(date) from public;
grant execute on function public.admin_execute_pending_buy_orders(date) to authenticated;

revoke all on function public.admin_execute_pending_sell_orders(date) from public;
grant execute on function public.admin_execute_pending_sell_orders(date) to authenticated;

revoke all on function public.cancel_pending_order(uuid) from public;
grant execute on function public.cancel_pending_order(uuid) to authenticated;

create or replace function public.admin_preview_player_repricing(target_date date default public.app_current_date_est())
returns table (
  result_player_id uuid,
  result_player_name text,
  result_pre_price numeric(18,6),
  result_post_price numeric(18,6),
  result_net_flow_flags numeric(18,6),
  result_total_units numeric(24,10),
  result_effective_capital numeric(18,6),
  result_price_multiplier numeric(18,6)
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin();

  return query
  with flows as (
    select
      p.id as player_id,
      p.name as player_name,
      p.current_price as pre_price,
      p.baseline_capital,
      coalesce(
        sum(
          case
            when o.order_type = 'buy' then o.flags_amount
            else 0::numeric(18,6)
          end
        ),
        0::numeric(18,6)
      ) as buy_flow_flags,
      coalesce(
        sum(
          case
            when o.order_type = 'sell' then coalesce(
              o.flags_amount,
              coalesce(o.units_amount, 0::numeric) * p.current_price
            )
            else 0::numeric
          end
        ),
        0::numeric
      )::numeric(18,6) as sell_flow_flags
    from public.players p
    left join public.orders o
      on o.player_id = p.id
      and o.trade_date = target_date
      and o.status = 'executed'
    group by p.id, p.name, p.current_price, p.baseline_capital
  ),
  calc_base as (
    select
      f.*,
      (f.buy_flow_flags - f.sell_flow_flags)::numeric(18,6) as net_flow_flags
    from flows f
  ),
  market_stats as (
    select
      coalesce(sum(abs(cb.net_flow_flags)), 0::numeric(18,6)) as total_abs_market_flow
    from calc_base cb
  ),
  calc as (
    select
      cb.*,
      ms.total_abs_market_flow,
      case
        when ms.total_abs_market_flow = 0 then 0::numeric(18,6)
        else (cb.net_flow_flags / ms.total_abs_market_flow)::numeric(18,6)
      end as market_flow_share,
      least(
        greatest(
          (
            case
              when ms.total_abs_market_flow = 0 then 0::numeric
              else cb.net_flow_flags / ms.total_abs_market_flow
            end
          ) * 0.05::numeric,
          -0.03::numeric
        ),
        0.03::numeric
      )::numeric(18,6) as bounded_flow_ratio
    from calc_base cb
    cross join market_stats ms
  ),
  units as (
    select
      h.player_id,
      coalesce(sum(h.units), 0::numeric)::numeric(24,10) as total_units
    from public.holdings h
    group by h.player_id
  )
  select
    c.player_id as result_player_id,
    c.player_name as result_player_name,
    c.pre_price as result_pre_price,
    round(
      greatest(0.01::numeric, c.pre_price * (1::numeric + c.bounded_flow_ratio)),
      6
    )::numeric(18,6) as result_post_price,
    c.net_flow_flags as result_net_flow_flags,
    coalesce(u.total_units, 0::numeric(24,10)) as result_total_units,
    (c.baseline_capital + c.net_flow_flags)::numeric(18,6) as result_effective_capital,
    round((1::numeric + c.bounded_flow_ratio), 6)::numeric(18,6) as result_price_multiplier
  from calc c
  left join units u on u.player_id = c.player_id
  order by c.pre_price desc, c.player_name asc;
end;
$$;

create or replace function public.admin_apply_player_repricing(target_date date default public.app_current_date_est())
returns table (
  result_player_id uuid,
  result_player_name text,
  result_pre_price numeric(18,6),
  result_post_price numeric(18,6),
  result_net_flow_flags numeric(18,6),
  result_total_units numeric(24,10),
  result_effective_capital numeric(18,6),
  result_price_multiplier numeric(18,6)
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin();

  return query
  with preview as (
    select *
    from public.admin_preview_player_repricing(target_date)
  ),
  upsert_snapshots as (
    insert into public.daily_player_snapshots (
      snap_date,
      player_id,
      pre_price,
      post_price,
      net_flow_flags,
      total_units,
      effective_capital,
      created_at
    )
    select
      target_date,
      p.result_player_id,
      p.result_pre_price,
      p.result_post_price,
      p.result_net_flow_flags,
      p.result_total_units,
      p.result_effective_capital,
      now()
    from preview p
    on conflict (snap_date, player_id) do update set
      pre_price = excluded.pre_price,
      post_price = excluded.post_price,
      net_flow_flags = excluded.net_flow_flags,
      total_units = excluded.total_units,
      effective_capital = excluded.effective_capital,
      created_at = now()
    returning player_id
  ),
  update_prices as (
    update public.players pl
    set
      current_price = p.result_post_price,
      updated_at = now()
    from preview p
    where pl.id = p.result_player_id
    returning pl.id
  )
  select
    p.result_player_id,
    p.result_player_name,
    p.result_pre_price,
    p.result_post_price,
    p.result_net_flow_flags,
    p.result_total_units,
    p.result_effective_capital,
    p.result_price_multiplier
  from preview p
  order by p.result_pre_price desc, p.result_player_name asc;
end;
$$;

revoke all on function public.admin_preview_player_repricing(date) from public;
grant execute on function public.admin_preview_player_repricing(date) to authenticated;

revoke all on function public.admin_apply_player_repricing(date) from public;
grant execute on function public.admin_apply_player_repricing(date) to authenticated;

create or replace function public.admin_override_player_price(
  target_player_id uuid,
  override_price numeric(18,6),
  override_reason text default null
)
returns table (
  result_player_id uuid,
  result_player_name text,
  result_previous_price numeric(18,6),
  result_current_price numeric(18,6),
  result_override_reason text,
  result_updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_reason text;
begin
  perform public.assert_admin();

  if target_player_id is null then
    raise exception 'target_player_id is required';
  end if;

  if override_price is null or override_price <= 0 then
    raise exception 'override_price must be > 0';
  end if;

  normalized_reason := nullif(btrim(override_reason), '');

  return query
  with current_row as (
    select p.id, p.name, p.current_price
    from public.players p
    where p.id = target_player_id
  ),
  updated as (
    update public.players p
    set
      current_price = round(override_price, 6),
      updated_at = now()
    from current_row c
    where p.id = c.id
    returning p.id, p.name, c.current_price as previous_price, p.current_price, p.updated_at
  )
  select
    u.id as result_player_id,
    u.name as result_player_name,
    u.previous_price as result_previous_price,
    u.current_price as result_current_price,
    normalized_reason as result_override_reason,
    u.updated_at as result_updated_at
  from updated u;

  if not found then
    raise exception 'Player not found for id %', target_player_id;
  end if;
end;
$$;

revoke all on function public.admin_override_player_price(uuid, numeric, text) from public;
grant execute on function public.admin_override_player_price(uuid, numeric, text) to authenticated;

create or replace function public.admin_snapshot_daily_user_metrics(
  target_date date default public.app_current_date_est()
)
returns table (
  result_user_id uuid,
  result_username text,
  result_impressions int,
  result_votes_cast int,
  result_votes_received int,
  result_net_worth_close numeric(18,6),
  result_holding_count int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin();

  return query
  with holdings_agg as (
    select
      h.user_id,
      count(*)::int as holding_count,
      coalesce(sum(h.units * p.current_price), 0::numeric)::numeric(18,6) as holdings_value
    from public.holdings h
    join public.players p on p.id = h.player_id
    where h.units > 0.005::numeric
    group by h.user_id
  ),
  impressions_agg as (
    select
      oa.viewer_user_id as user_id,
      count(*)::int as impressions
    from public.opinion_assignments oa
    where oa.assigned_for_date = target_date
    group by oa.viewer_user_id
  ),
  votes_cast_agg as (
    select
      ov.voter_user_id as user_id,
      count(*)::int as votes_cast
    from public.opinion_votes ov
    where ov.assigned_for_date = target_date
    group by ov.voter_user_id
  ),
  votes_received_agg as (
    select
      o.user_id,
      count(ov.id)::int as votes_received
    from public.opinions o
    left join public.opinion_votes ov
      on ov.opinion_id = o.id
      and ov.assigned_for_date = target_date
    where o.submitted_for_date = (target_date - 1)
      and o.status = 'active'
    group by o.user_id
  ),
  base as (
    select
      pr.id as user_id,
      pr.username,
      coalesce(ia.impressions, 0)::int as impressions,
      coalesce(vca.votes_cast, 0)::int as votes_cast,
      coalesce(vra.votes_received, 0)::int as votes_received,
      (
        coalesce(w.liquid_flags, 0::numeric)
        + coalesce(ha.holdings_value, 0::numeric)
      )::numeric(18,6) as net_worth_close,
      coalesce(ha.holding_count, 0)::int as holding_count
    from public.profiles pr
    left join public.wallets w on w.user_id = pr.id
    left join holdings_agg ha on ha.user_id = pr.id
    left join impressions_agg ia on ia.user_id = pr.id
    left join votes_cast_agg vca on vca.user_id = pr.id
    left join votes_received_agg vra on vra.user_id = pr.id
  ),
  upserted as (
    insert into public.daily_user_metrics (
      metric_date,
      user_id,
      impressions,
      votes_cast,
      votes_received,
      net_worth_close
    )
    select
      target_date,
      b.user_id,
      b.impressions,
      b.votes_cast,
      b.votes_received,
      b.net_worth_close
    from base b
    on conflict (metric_date, user_id) do update set
      impressions = excluded.impressions,
      votes_cast = excluded.votes_cast,
      votes_received = excluded.votes_received,
      net_worth_close = excluded.net_worth_close
    returning
      user_id,
      impressions,
      votes_cast,
      votes_received,
      net_worth_close
  )
  select
    u.user_id as result_user_id,
    b.username as result_username,
    u.impressions as result_impressions,
    u.votes_cast as result_votes_cast,
    u.votes_received as result_votes_received,
    u.net_worth_close as result_net_worth_close,
    b.holding_count as result_holding_count
  from upserted u
  join base b on b.user_id = u.user_id
  order by b.username asc;
end;
$$;

create or replace function public.admin_run_daily_close(
  target_date date default public.app_current_date_est()
)
returns table (
  result_step text,
  result_status text,
  result_detail text,
  result_count int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_close_status public.job_status;
  v_buy_total int := 0;
  v_buy_executed int := 0;
  v_buy_failed int := 0;
  v_sell_total int := 0;
  v_sell_executed int := 0;
  v_sell_failed int := 0;
  v_repricing_rows int := 0;
  v_published_rows int := 0;
  v_metrics_rows int := 0;
begin
  perform public.assert_admin();

  if target_date is null then
    raise exception 'Target date is required';
  end if;

  select sj.status
  into v_existing_close_status
  from public.system_jobs sj
  where sj.job_date = target_date
    and sj.job_type = 'close_compute';

  if v_existing_close_status = 'success' then
    return query
    select
      'close_compute'::text,
      'skipped'::text,
      'close job already succeeded for date'::text,
      0::int;
    return;
  end if;

  insert into public.system_jobs (
    job_date,
    job_type,
    status,
    started_at,
    finished_at,
    log_json
  )
  values (
    target_date,
    'close_compute',
    'running',
    now(),
    null,
    jsonb_build_object('started_by', auth.uid(), 'started_at', now())
  )
  on conflict (job_date, job_type) do update set
    status = 'running',
    started_at = now(),
    finished_at = null,
    log_json = coalesce(system_jobs.log_json, '{}'::jsonb)
      || jsonb_build_object('restarted_at', now(), 'restarted_by', auth.uid());

  select
    count(*)::int,
    count(*) filter (where r.result_status = 'executed')::int,
    count(*) filter (where r.result_status = 'failed')::int
  into
    v_buy_total,
    v_buy_executed,
    v_buy_failed
  from public.admin_execute_pending_buy_orders(target_date) r;

  return query
  select
    'execute_buy_orders'::text,
    'success'::text,
    format('total=%s executed=%s failed=%s', v_buy_total, v_buy_executed, v_buy_failed)::text,
    v_buy_executed::int;

  select
    count(*)::int,
    count(*) filter (where r.result_status = 'executed')::int,
    count(*) filter (where r.result_status = 'failed')::int
  into
    v_sell_total,
    v_sell_executed,
    v_sell_failed
  from public.admin_execute_pending_sell_orders(target_date) r;

  return query
  select
    'execute_sell_orders'::text,
    'success'::text,
    format('total=%s executed=%s failed=%s', v_sell_total, v_sell_executed, v_sell_failed)::text,
    v_sell_executed::int;

  if exists (
    select 1
    from public.daily_player_snapshots dps
    where dps.snap_date = target_date
  ) then
    return query
    select
      'repricing'::text,
      'skipped'::text,
      'daily player snapshots already exist for date'::text,
      0::int;
  else
    select count(*)::int
    into v_repricing_rows
    from public.admin_apply_player_repricing(target_date);

    return query
    select
      'repricing'::text,
      'success'::text,
      format('players_repriced=%s', v_repricing_rows)::text,
      v_repricing_rows::int;
  end if;

  if exists (
    select 1
    from public.daily_winners dw
    where dw.winner_date = target_date
  ) then
    insert into public.system_jobs (
      job_date,
      job_type,
      status,
      started_at,
      finished_at,
      log_json
    )
    values (
      target_date,
      'publish',
      'success',
      now(),
      now(),
      jsonb_build_object('already_published', true)
    )
    on conflict (job_date, job_type) do update set
      status = 'success',
      finished_at = now(),
      log_json = coalesce(system_jobs.log_json, '{}'::jsonb)
        || jsonb_build_object('already_published', true, 'updated_at', now());

    return query
    select
      'publish_winners'::text,
      'skipped'::text,
      'winners already published for date'::text,
      0::int;
  else
    insert into public.system_jobs (
      job_date,
      job_type,
      status,
      started_at,
      finished_at,
      log_json
    )
    values (
      target_date,
      'publish',
      'running',
      now(),
      null,
      jsonb_build_object('started_by', auth.uid(), 'started_at', now())
    )
    on conflict (job_date, job_type) do update set
      status = 'running',
      started_at = now(),
      finished_at = null,
      log_json = coalesce(system_jobs.log_json, '{}'::jsonb)
        || jsonb_build_object('restarted_at', now(), 'restarted_by', auth.uid());

    begin
      select count(*)::int
      into v_published_rows
      from public.admin_publish_daily_winners(target_date);

      update public.system_jobs sj
      set
        status = 'success',
        finished_at = now(),
        log_json = coalesce(sj.log_json, '{}'::jsonb)
          || jsonb_build_object('published_rows', v_published_rows, 'finished_at', now())
      where sj.job_date = target_date
        and sj.job_type = 'publish';
    exception
      when others then
        update public.system_jobs sj
        set
          status = 'failed',
          finished_at = now(),
          log_json = coalesce(sj.log_json, '{}'::jsonb)
            || jsonb_build_object('error', SQLERRM, 'failed_at', now())
        where sj.job_date = target_date
          and sj.job_type = 'publish';
        raise;
    end;

    return query
    select
      'publish_winners'::text,
      'success'::text,
      format('published_rows=%s', v_published_rows)::text,
      v_published_rows::int;
  end if;

  select count(*)::int
  into v_metrics_rows
  from public.admin_snapshot_daily_user_metrics(target_date);

  return query
  select
    'snapshot_user_metrics'::text,
    'success'::text,
    format('rows_upserted=%s', v_metrics_rows)::text,
    v_metrics_rows::int;

  update public.system_jobs sj
  set
    status = 'success',
    finished_at = now(),
    log_json = coalesce(sj.log_json, '{}'::jsonb) || jsonb_build_object(
      'buy_total', v_buy_total,
      'buy_executed', v_buy_executed,
      'buy_failed', v_buy_failed,
      'sell_total', v_sell_total,
      'sell_executed', v_sell_executed,
      'sell_failed', v_sell_failed,
      'repricing_rows', v_repricing_rows,
      'published_rows', v_published_rows,
      'metrics_rows', v_metrics_rows,
      'finished_at', now()
    )
  where sj.job_date = target_date
    and sj.job_type = 'close_compute';

  return query
  select
    'close_compute'::text,
    'success'::text,
    'pipeline complete'::text,
    1::int;
exception
  when others then
    update public.system_jobs sj
    set
      status = 'failed',
      finished_at = now(),
      log_json = coalesce(sj.log_json, '{}'::jsonb)
        || jsonb_build_object('error', SQLERRM, 'failed_at', now())
    where sj.job_date = target_date
      and sj.job_type = 'close_compute';
    raise;
end;
$$;

revoke all on function public.admin_snapshot_daily_user_metrics(date) from public;
grant execute on function public.admin_snapshot_daily_user_metrics(date) to authenticated;

revoke all on function public.admin_run_daily_close(date) from public;
grant execute on function public.admin_run_daily_close(date) to authenticated;

create or replace function public.admin_get_daily_close_diagnostics(
  target_date date default public.app_current_date_est()
)
returns table (
  result_target_date date,
  result_close_job_status text,
  result_close_job_started_at timestamptz,
  result_close_job_finished_at timestamptz,
  result_close_job_error text,
  result_publish_job_status text,
  result_publish_job_started_at timestamptz,
  result_publish_job_finished_at timestamptz,
  result_publish_job_error text,
  result_winners_count int,
  result_portfolio_snapshots_count int,
  result_holding_snapshots_count int,
  result_pending_buy_orders_count int,
  result_pending_sell_orders_count int,
  result_failed_orders_count int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  close_job public.system_jobs%rowtype;
  publish_job public.system_jobs%rowtype;
begin
  perform public.assert_admin();

  if target_date is null then
    raise exception 'Target date is required';
  end if;

  select sj.*
  into close_job
  from public.system_jobs sj
  where sj.job_date = target_date
    and sj.job_type = 'close_compute';

  select sj.*
  into publish_job
  from public.system_jobs sj
  where sj.job_date = target_date
    and sj.job_type = 'publish';

  return query
  select
    target_date as result_target_date,
    coalesce(close_job.status::text, 'not_run') as result_close_job_status,
    close_job.started_at as result_close_job_started_at,
    close_job.finished_at as result_close_job_finished_at,
    close_job.log_json ->> 'error' as result_close_job_error,
    coalesce(publish_job.status::text, 'not_run') as result_publish_job_status,
    publish_job.started_at as result_publish_job_started_at,
    publish_job.finished_at as result_publish_job_finished_at,
    publish_job.log_json ->> 'error' as result_publish_job_error,
    (
      select count(*)::int
      from public.daily_winners dw
      where dw.winner_date = target_date
    ) as result_winners_count,
    (
      select count(*)::int
      from public.daily_user_portfolio_snapshots ps
      where ps.snap_date = target_date
    ) as result_portfolio_snapshots_count,
    (
      select count(*)::int
      from public.daily_user_holding_snapshots hs
      where hs.snap_date = target_date
    ) as result_holding_snapshots_count,
    (
      select count(*)::int
      from public.orders o
      where o.trade_date = target_date
        and o.status = 'pending'
        and o.order_type = 'buy'
    ) as result_pending_buy_orders_count,
    (
      select count(*)::int
      from public.orders o
      where o.trade_date = target_date
        and o.status = 'pending'
        and o.order_type = 'sell'
    ) as result_pending_sell_orders_count,
    (
      select count(*)::int
      from public.orders o
      where o.trade_date = target_date
        and o.status = 'failed'
    ) as result_failed_orders_count;
end;
$$;

create or replace function public.admin_list_recent_system_jobs(
  limit_rows int default 12
)
returns table (
  result_job_date date,
  result_job_type text,
  result_status text,
  result_started_at timestamptz,
  result_finished_at timestamptz,
  result_error text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_limit int;
begin
  perform public.assert_admin();
  safe_limit := least(greatest(coalesce(limit_rows, 12), 1), 100);

  return query
  select
    sj.job_date as result_job_date,
    sj.job_type::text as result_job_type,
    sj.status::text as result_status,
    sj.started_at as result_started_at,
    sj.finished_at as result_finished_at,
    coalesce(sj.log_json ->> 'error', '') as result_error
  from public.system_jobs sj
  order by sj.job_date desc, sj.started_at desc nulls last, sj.finished_at desc nulls last
  limit safe_limit;
end;
$$;

create or replace function public.admin_list_recent_order_execution_activity(
  limit_rows int default 12
)
returns table (
  result_trade_date date,
  result_order_type text,
  result_batch_started_at timestamptz,
  result_batch_finished_at timestamptz,
  result_total_orders int,
  result_executed_orders int,
  result_failed_orders int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_limit int;
begin
  perform public.assert_admin();
  safe_limit := least(greatest(coalesce(limit_rows, 12), 1), 100);

  return query
  with grouped as (
    select
      o.trade_date,
      o.order_type::text as order_type,
      date_trunc('minute', o.executed_at) as batch_minute,
      min(o.executed_at) as batch_started_at,
      max(o.executed_at) as batch_finished_at,
      count(*)::int as total_orders,
      count(*) filter (where o.status = 'executed')::int as executed_orders,
      count(*) filter (where o.status = 'failed')::int as failed_orders
    from public.orders o
    where o.executed_at is not null
      and o.status in ('executed', 'failed')
    group by
      o.trade_date,
      o.order_type::text,
      date_trunc('minute', o.executed_at)
  )
  select
    g.trade_date as result_trade_date,
    g.order_type as result_order_type,
    g.batch_started_at as result_batch_started_at,
    g.batch_finished_at as result_batch_finished_at,
    g.total_orders as result_total_orders,
    g.executed_orders as result_executed_orders,
    g.failed_orders as result_failed_orders
  from grouped g
  order by g.batch_finished_at desc nulls last
  limit safe_limit;
end;
$$;

revoke all on function public.admin_get_daily_close_diagnostics(date) from public;
grant execute on function public.admin_get_daily_close_diagnostics(date) to authenticated;

revoke all on function public.admin_list_recent_system_jobs(int) from public;
grant execute on function public.admin_list_recent_system_jobs(int) to authenticated;

revoke all on function public.admin_list_recent_order_execution_activity(int) from public;
grant execute on function public.admin_list_recent_order_execution_activity(int) to authenticated;

create table if not exists public.daily_user_portfolio_snapshots (
  snap_date date not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  unplanted_flags_close numeric(18,6) not null default 0,
  planted_value_close numeric(18,6) not null default 0,
  total_value_close numeric(18,6) not null default 0,
  created_at timestamptz not null default now(),
  primary key (snap_date, user_id),
  check (unplanted_flags_close >= 0),
  check (planted_value_close >= 0),
  check (total_value_close >= 0)
);

create table if not exists public.daily_user_holding_snapshots (
  snap_date date not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  player_name text not null,
  units_close numeric(24,10) not null default 0,
  market_value_close numeric(18,6) not null default 0,
  avg_cost_basis_close numeric(18,6) not null default 0,
  current_price_close numeric(18,6) not null default 0,
  created_at timestamptz not null default now(),
  primary key (snap_date, user_id, player_id),
  check (units_close >= 0),
  check (market_value_close >= 0),
  check (avg_cost_basis_close >= 0),
  check (current_price_close >= 0)
);

create index if not exists idx_daily_user_portfolio_snapshots_user_date
  on public.daily_user_portfolio_snapshots (user_id, snap_date desc);
create index if not exists idx_daily_user_holding_snapshots_user_date
  on public.daily_user_holding_snapshots (user_id, snap_date desc);

alter table public.daily_user_portfolio_snapshots enable row level security;
alter table public.daily_user_holding_snapshots enable row level security;

drop policy if exists portfolio_snapshots_select_own on public.daily_user_portfolio_snapshots;
create policy portfolio_snapshots_select_own
on public.daily_user_portfolio_snapshots
for select
using (auth.uid() = user_id);

drop policy if exists holding_snapshots_select_own on public.daily_user_holding_snapshots;
create policy holding_snapshots_select_own
on public.daily_user_holding_snapshots
for select
using (auth.uid() = user_id);

create or replace function public.admin_snapshot_daily_portfolios(
  target_date date default public.app_current_date_est()
)
returns table (
  result_user_id uuid,
  result_username text,
  result_holding_count int,
  result_unplanted_flags_close numeric(18,6),
  result_planted_value_close numeric(18,6),
  result_total_value_close numeric(18,6)
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin();

  if target_date is null then
    raise exception 'Target date is required';
  end if;

  delete from public.daily_user_holding_snapshots hs
  where hs.snap_date = target_date;

  delete from public.daily_user_portfolio_snapshots ps
  where ps.snap_date = target_date;

  with live_holdings as (
    select
      h.user_id,
      h.player_id,
      p.name as player_name,
      h.units,
      h.avg_cost_basis,
      p.current_price,
      (h.units * p.current_price)::numeric(18,6) as market_value
    from public.holdings h
    join public.players p on p.id = h.player_id
    where h.units > 0.005::numeric
  )
  insert into public.daily_user_holding_snapshots (
    snap_date,
    user_id,
    player_id,
    player_name,
    units_close,
    market_value_close,
    avg_cost_basis_close,
    current_price_close,
    created_at
  )
  select
    target_date,
    lh.user_id,
    lh.player_id,
    lh.player_name,
    lh.units,
    lh.market_value,
    lh.avg_cost_basis,
    lh.current_price,
    now()
  from live_holdings lh;

  return query
  with live_holdings as (
    select
      h.user_id,
      h.player_id,
      p.name as player_name,
      h.units,
      h.avg_cost_basis,
      p.current_price,
      (h.units * p.current_price)::numeric(18,6) as market_value
    from public.holdings h
    join public.players p on p.id = h.player_id
    where h.units > 0.005::numeric
  ),
  holdings_agg as (
    select
      lh.user_id,
      count(*)::int as holding_count,
      coalesce(sum(lh.market_value), 0::numeric)::numeric(18,6) as planted_value_close
    from live_holdings lh
    group by lh.user_id
  ),
  base as (
    select
      pr.id as user_id,
      pr.username,
      coalesce(w.liquid_flags, 0::numeric)::numeric(18,6) as unplanted_flags_close,
      coalesce(ha.planted_value_close, 0::numeric)::numeric(18,6) as planted_value_close,
      coalesce(ha.holding_count, 0)::int as holding_count,
      (
        coalesce(w.liquid_flags, 0::numeric)
        + coalesce(ha.planted_value_close, 0::numeric)
      )::numeric(18,6) as total_value_close
    from public.profiles pr
    left join public.wallets w on w.user_id = pr.id
    left join holdings_agg ha on ha.user_id = pr.id
  ),
  insert_portfolios as (
    insert into public.daily_user_portfolio_snapshots (
      snap_date,
      user_id,
      unplanted_flags_close,
      planted_value_close,
      total_value_close,
      created_at
    )
    select
      target_date,
      b.user_id,
      b.unplanted_flags_close,
      b.planted_value_close,
      b.total_value_close,
      now()
    from base b
    returning user_id
  )
  select
    b.user_id as result_user_id,
    b.username as result_username,
    b.holding_count as result_holding_count,
    b.unplanted_flags_close as result_unplanted_flags_close,
    b.planted_value_close as result_planted_value_close,
    b.total_value_close as result_total_value_close
  from base b
  join insert_portfolios ip on ip.user_id = b.user_id
  order by b.username asc;
end;
$$;

create or replace function public.get_user_portfolio_history(
  target_user_id uuid,
  lookback_days int default 30
)
returns table (
  result_snap_date date,
  result_unplanted_flags_close numeric(18,6),
  result_planted_value_close numeric(18,6),
  result_total_value_close numeric(18,6),
  result_holdings_json jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  clamped_days int;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  clamped_days := greatest(1, least(coalesce(lookback_days, 30), 120));

  return query
  with date_window as (
    select generate_series(
      (public.app_current_date_est() - (clamped_days - 1))::timestamp,
      public.app_current_date_est()::timestamp,
      interval '1 day'
    )::date as snap_date
  ),
  current_holdings as (
    select
      p.name as player_name,
      h.units,
      (h.units * p.current_price)::numeric(18,6) as market_value
    from public.holdings h
    join public.players p on p.id = h.player_id
    where h.user_id = target_user_id
      and h.units > 0.005::numeric
  ),
  current_holdings_agg as (
    select
      coalesce(sum(ch.market_value), 0::numeric)::numeric(18,6) as planted_value_close,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'player_name', ch.player_name,
            'units', round(ch.units, 6),
            'value', round(ch.market_value, 6)
          )
          order by ch.market_value desc, ch.player_name asc
        ),
        '[]'::jsonb
      ) as holdings_json
    from current_holdings ch
  ),
  current_wallet as (
    select
      coalesce(
        (
          select w.liquid_flags
          from public.wallets w
          where w.user_id = target_user_id
        ),
        0::numeric
      )::numeric(18,6) as unplanted_flags_close
  )
  select
    dw.snap_date as result_snap_date,
    case
      when dw.snap_date = public.app_current_date_est() then cw.unplanted_flags_close
      when latest_ps.snap_date is not null then latest_ps.unplanted_flags_close
      else 0::numeric(18,6)
    end::numeric(18,6) as result_unplanted_flags_close,
    case
      when dw.snap_date = public.app_current_date_est() then cha.planted_value_close
      when latest_ps.snap_date is not null then latest_ps.planted_value_close
      else 0::numeric(18,6)
    end::numeric(18,6) as result_planted_value_close,
    case
      when dw.snap_date = public.app_current_date_est() then (cw.unplanted_flags_close + cha.planted_value_close)
      when latest_ps.snap_date is not null then latest_ps.total_value_close
      else 0::numeric(18,6)
    end::numeric(18,6) as result_total_value_close,
    case
      when dw.snap_date = public.app_current_date_est() then cha.holdings_json
      when latest_ps.snap_date is not null then coalesce(latest_h.holdings_json, '[]'::jsonb)
      else '[]'::jsonb
    end as result_holdings_json
  from date_window dw
  cross join current_wallet cw
  cross join current_holdings_agg cha
  left join lateral (
    select
      ps.snap_date,
      ps.unplanted_flags_close,
      ps.planted_value_close,
      ps.total_value_close
    from public.daily_user_portfolio_snapshots ps
    where ps.user_id = target_user_id
      and ps.snap_date <= dw.snap_date
    order by ps.snap_date desc
    limit 1
  ) latest_ps on true
  left join lateral (
    select
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'player_name', hs.player_name,
            'units', round(hs.units_close, 6),
            'value', round(hs.market_value_close, 6)
          )
          order by hs.market_value_close desc, hs.player_name asc
        ),
        '[]'::jsonb
      ) as holdings_json
    from public.daily_user_holding_snapshots hs
    where hs.user_id = target_user_id
      and hs.snap_date = latest_ps.snap_date
      and hs.units_close > 0.005::numeric
  ) latest_h on true
  order by dw.snap_date asc;
end;
$$;

create or replace function public.admin_run_daily_close(
  target_date date default public.app_current_date_est()
)
returns table (
  result_step text,
  result_status text,
  result_detail text,
  result_count int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_close_status public.job_status;
  v_buy_total int := 0;
  v_buy_executed int := 0;
  v_buy_failed int := 0;
  v_sell_total int := 0;
  v_sell_executed int := 0;
  v_sell_failed int := 0;
  v_repricing_rows int := 0;
  v_published_rows int := 0;
  v_portfolio_rows int := 0;
  v_metrics_rows int := 0;
begin
  perform public.assert_admin();

  if target_date is null then
    raise exception 'Target date is required';
  end if;

  select sj.status
  into v_existing_close_status
  from public.system_jobs sj
  where sj.job_date = target_date
    and sj.job_type = 'close_compute';

  if v_existing_close_status = 'success' then
    return query
    select
      'close_compute'::text,
      'skipped'::text,
      'close job already succeeded for date'::text,
      0::int;
    return;
  end if;

  insert into public.system_jobs (
    job_date,
    job_type,
    status,
    started_at,
    finished_at,
    log_json
  )
  values (
    target_date,
    'close_compute',
    'running',
    now(),
    null,
    jsonb_build_object('started_by', auth.uid(), 'started_at', now())
  )
  on conflict (job_date, job_type) do update set
    status = 'running',
    started_at = now(),
    finished_at = null,
    log_json = coalesce(system_jobs.log_json, '{}'::jsonb)
      || jsonb_build_object('restarted_at', now(), 'restarted_by', auth.uid());

  select
    count(*)::int,
    count(*) filter (where r.result_status = 'executed')::int,
    count(*) filter (where r.result_status = 'failed')::int
  into
    v_buy_total,
    v_buy_executed,
    v_buy_failed
  from public.admin_execute_pending_buy_orders(target_date) r;

  return query
  select
    'execute_buy_orders'::text,
    'success'::text,
    format('total=%s executed=%s failed=%s', v_buy_total, v_buy_executed, v_buy_failed)::text,
    v_buy_executed::int;

  select
    count(*)::int,
    count(*) filter (where r.result_status = 'executed')::int,
    count(*) filter (where r.result_status = 'failed')::int
  into
    v_sell_total,
    v_sell_executed,
    v_sell_failed
  from public.admin_execute_pending_sell_orders(target_date) r;

  return query
  select
    'execute_sell_orders'::text,
    'success'::text,
    format('total=%s executed=%s failed=%s', v_sell_total, v_sell_executed, v_sell_failed)::text,
    v_sell_executed::int;

  if exists (
    select 1
    from public.daily_player_snapshots dps
    where dps.snap_date = target_date
  ) then
    return query
    select
      'repricing'::text,
      'skipped'::text,
      'daily player snapshots already exist for date'::text,
      0::int;
  else
    select count(*)::int
    into v_repricing_rows
    from public.admin_apply_player_repricing(target_date);

    return query
    select
      'repricing'::text,
      'success'::text,
      format('players_repriced=%s', v_repricing_rows)::text,
      v_repricing_rows::int;
  end if;

  if exists (
    select 1
    from public.daily_winners dw
    where dw.winner_date = target_date
  ) then
    insert into public.system_jobs (
      job_date,
      job_type,
      status,
      started_at,
      finished_at,
      log_json
    )
    values (
      target_date,
      'publish',
      'success',
      now(),
      now(),
      jsonb_build_object('already_published', true)
    )
    on conflict (job_date, job_type) do update set
      status = 'success',
      finished_at = now(),
      log_json = coalesce(system_jobs.log_json, '{}'::jsonb)
        || jsonb_build_object('already_published', true, 'updated_at', now());

    return query
    select
      'publish_winners'::text,
      'skipped'::text,
      'winners already published for date'::text,
      0::int;
  else
    insert into public.system_jobs (
      job_date,
      job_type,
      status,
      started_at,
      finished_at,
      log_json
    )
    values (
      target_date,
      'publish',
      'running',
      now(),
      null,
      jsonb_build_object('started_by', auth.uid(), 'started_at', now())
    )
    on conflict (job_date, job_type) do update set
      status = 'running',
      started_at = now(),
      finished_at = null,
      log_json = coalesce(system_jobs.log_json, '{}'::jsonb)
        || jsonb_build_object('restarted_at', now(), 'restarted_by', auth.uid());

    begin
      select count(*)::int
      into v_published_rows
      from public.admin_publish_daily_winners(target_date);

      update public.system_jobs sj
      set
        status = 'success',
        finished_at = now(),
        log_json = coalesce(sj.log_json, '{}'::jsonb)
          || jsonb_build_object('published_rows', v_published_rows, 'finished_at', now())
      where sj.job_date = target_date
        and sj.job_type = 'publish';
    exception
      when others then
        update public.system_jobs sj
        set
          status = 'failed',
          finished_at = now(),
          log_json = coalesce(sj.log_json, '{}'::jsonb)
            || jsonb_build_object('error', SQLERRM, 'failed_at', now())
        where sj.job_date = target_date
          and sj.job_type = 'publish';
        raise;
    end;

    return query
    select
      'publish_winners'::text,
      'success'::text,
      format('published_rows=%s', v_published_rows)::text,
      v_published_rows::int;
  end if;

  select count(*)::int
  into v_portfolio_rows
  from public.admin_snapshot_daily_portfolios(target_date);

  return query
  select
    'snapshot_portfolios'::text,
    'success'::text,
    format('rows_upserted=%s', v_portfolio_rows)::text,
    v_portfolio_rows::int;

  select count(*)::int
  into v_metrics_rows
  from public.admin_snapshot_daily_user_metrics(target_date);

  return query
  select
    'snapshot_user_metrics'::text,
    'success'::text,
    format('rows_upserted=%s', v_metrics_rows)::text,
    v_metrics_rows::int;

  update public.system_jobs sj
  set
    status = 'success',
    finished_at = now(),
    log_json = coalesce(sj.log_json, '{}'::jsonb) || jsonb_build_object(
      'buy_total', v_buy_total,
      'buy_executed', v_buy_executed,
      'buy_failed', v_buy_failed,
      'sell_total', v_sell_total,
      'sell_executed', v_sell_executed,
      'sell_failed', v_sell_failed,
      'repricing_rows', v_repricing_rows,
      'published_rows', v_published_rows,
      'portfolio_rows', v_portfolio_rows,
      'metrics_rows', v_metrics_rows,
      'finished_at', now()
    )
  where sj.job_date = target_date
    and sj.job_type = 'close_compute';

  return query
  select
    'close_compute'::text,
    'success'::text,
    'pipeline complete'::text,
    1::int;
exception
  when others then
    update public.system_jobs sj
    set
      status = 'failed',
      finished_at = now(),
      log_json = coalesce(sj.log_json, '{}'::jsonb)
        || jsonb_build_object('error', SQLERRM, 'failed_at', now())
    where sj.job_date = target_date
      and sj.job_type = 'close_compute';
    raise;
end;
$$;

revoke all on function public.admin_snapshot_daily_portfolios(date) from public;
grant execute on function public.admin_snapshot_daily_portfolios(date) to authenticated;

revoke all on function public.get_user_portfolio_history(uuid, int) from public;
grant execute on function public.get_user_portfolio_history(uuid, int) to authenticated;

revoke all on function public.admin_run_daily_close(date) from public;
grant execute on function public.admin_run_daily_close(date) to authenticated;
