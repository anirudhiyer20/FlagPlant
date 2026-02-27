-- FlagPlant MVP schema (Phase 1)
-- Run in Supabase SQL editor.

create extension if not exists pgcrypto;

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
      and flags_amount is null
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
      and oa.assigned_for_date = opinions.submitted_for_date
  )
);
drop policy if exists opinions_insert_own on public.opinions;
create policy opinions_insert_own on public.opinions for insert with check (auth.uid() = user_id);
drop policy if exists assignments_select_own on public.opinion_assignments;
create policy assignments_select_own on public.opinion_assignments for select using (auth.uid() = viewer_user_id);
drop policy if exists votes_select_own on public.opinion_votes;
create policy votes_select_own on public.opinion_votes for select using (auth.uid() = voter_user_id);
drop policy if exists votes_insert_own on public.opinion_votes;
create policy votes_insert_own on public.opinion_votes for insert with check (auth.uid() = voter_user_id);
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
    order_type = 'sell'
    or (
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
  )
);
drop policy if exists ledger_select_own on public.wallet_ledger;
create policy ledger_select_own on public.wallet_ledger for select using (auth.uid() = user_id);
drop policy if exists metrics_select_own on public.daily_user_metrics;
create policy metrics_select_own on public.daily_user_metrics for select using (auth.uid() = user_id);

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
    and h.units > 0
  group by p.id
  order by p.id;
end;
$$;

revoke all on function public.get_player_market_stats() from public;
grant execute on function public.get_player_market_stats() to authenticated;

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

create or replace function public.get_daily_winner_preview(target_date date default current_date)
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
begin
  perform public.assert_admin();

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
    where o.submitted_for_date = target_date
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

create or replace function public.admin_publish_daily_winners(target_date date default current_date)
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

create or replace function public.admin_preview_pending_buy_orders(target_date date default current_date)
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

create or replace function public.admin_execute_pending_buy_orders(target_date date default current_date)
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

revoke all on function public.admin_preview_pending_buy_orders(date) from public;
grant execute on function public.admin_preview_pending_buy_orders(date) to authenticated;

revoke all on function public.admin_execute_pending_buy_orders(date) from public;
grant execute on function public.admin_execute_pending_buy_orders(date) to authenticated;

create or replace function public.admin_preview_player_repricing(target_date date default current_date)
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
            when o.order_type = 'sell' then coalesce(o.units_amount, 0::numeric) * p.current_price
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

create or replace function public.admin_apply_player_repricing(target_date date default current_date)
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

