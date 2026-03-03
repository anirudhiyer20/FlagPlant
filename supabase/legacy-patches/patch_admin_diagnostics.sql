-- Adds admin diagnostics RPCs for daily-close observability.
-- Includes:
-- 1) date-scoped health summary
-- 2) recent system job log listing

drop function if exists public.admin_get_daily_close_diagnostics(date);
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
  result_cancelled_orders_count int,
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
        and o.status = 'cancelled'
    ) as result_cancelled_orders_count,
    (
      select count(*)::int
      from public.orders o
      where o.trade_date = target_date
        and o.status = 'failed'
    ) as result_failed_orders_count;
end;
$$;

-- SQL-editor helper: same diagnostics shape, but without auth context requirements.
-- This is intentionally not granted to app roles.
drop function if exists public.sql_editor_get_daily_close_diagnostics(date);
create or replace function public.sql_editor_get_daily_close_diagnostics(
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
  result_cancelled_orders_count int,
  result_failed_orders_count int
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  close_job public.system_jobs%rowtype;
  publish_job public.system_jobs%rowtype;
begin
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
        and o.status = 'cancelled'
    ) as result_cancelled_orders_count,
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

revoke all on function public.sql_editor_get_daily_close_diagnostics(date) from public;
revoke all on function public.sql_editor_get_daily_close_diagnostics(date) from anon;
revoke all on function public.sql_editor_get_daily_close_diagnostics(date) from authenticated;
grant execute on function public.sql_editor_get_daily_close_diagnostics(date) to postgres;

revoke all on function public.admin_list_recent_system_jobs(int) from public;
grant execute on function public.admin_list_recent_system_jobs(int) to authenticated;

revoke all on function public.admin_list_recent_order_execution_activity(int) from public;
grant execute on function public.admin_list_recent_order_execution_activity(int) to authenticated;
