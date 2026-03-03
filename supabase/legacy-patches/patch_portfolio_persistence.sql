-- Patch for existing projects:
-- adds persistent end-of-day portfolio snapshots and snapshot-backed history RPC.

create or replace function public.app_current_date_est()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/New_York')::date
$$;

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
  v_today date;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  clamped_days := greatest(1, least(coalesce(lookback_days, 30), 120));
  v_today := public.app_current_date_est();

  return query
  with date_window as (
    select generate_series(
      (v_today - (clamped_days - 1))::timestamp,
      v_today::timestamp,
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
      when dw.snap_date = v_today then cw.unplanted_flags_close
      when latest_ps.snap_date is not null then latest_ps.unplanted_flags_close
      else 0::numeric(18,6)
    end::numeric(18,6) as result_unplanted_flags_close,
    case
      when dw.snap_date = v_today then cha.planted_value_close
      when latest_ps.snap_date is not null then latest_ps.planted_value_close
      else 0::numeric(18,6)
    end::numeric(18,6) as result_planted_value_close,
    case
      when dw.snap_date = v_today then (cw.unplanted_flags_close + cha.planted_value_close)
      when latest_ps.snap_date is not null then latest_ps.total_value_close
      else 0::numeric(18,6)
    end::numeric(18,6) as result_total_value_close,
    case
      when dw.snap_date = v_today then cha.holdings_json
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
