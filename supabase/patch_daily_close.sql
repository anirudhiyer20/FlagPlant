-- Patch for existing projects:
-- adds admin daily-close pipeline RPC + daily user metrics snapshot RPC.

create or replace function public.app_current_date_est()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/New_York')::date
$$;

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
