-- Patch for existing projects:
-- adds automatic midnight ET daily cadence + vote assignment generation for next day.

create extension if not exists pg_cron with schema extensions;

create or replace function public.assert_admin()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role public.user_role;
begin
  -- Allow trusted database-internal callers (pg_cron / SQL editor).
  if auth.uid() is null and current_user in ('postgres', 'supabase_admin') then
    return;
  end if;

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

create or replace function public.admin_generate_vote_assignments(
  target_vote_date date default public.app_current_date_est(),
  max_assignments_per_viewer int default 5
)
returns table (
  result_vote_date date,
  result_source_opinion_date date,
  result_candidate_pairs int,
  result_inserted_rows int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_opinion_date date;
  v_candidate_pairs int := 0;
  v_inserted_rows int := 0;
begin
  perform public.assert_admin();

  if target_vote_date is null then
    raise exception 'Target vote date is required';
  end if;

  if max_assignments_per_viewer is null or max_assignments_per_viewer < 1 then
    raise exception 'max_assignments_per_viewer must be >= 1';
  end if;

  v_source_opinion_date := target_vote_date - 1;

  with candidate_pairs as (
    select
      o.id as opinion_id,
      p.id as viewer_user_id,
      target_vote_date as assigned_for_date
    from public.opinions o
    cross join public.profiles p
    where o.submitted_for_date = v_source_opinion_date
      and o.status = 'active'
      and o.user_id <> p.id
  ),
  ranked as (
    select
      cp.*,
      row_number() over (
        partition by cp.viewer_user_id, cp.assigned_for_date
        order by
          md5(
            cp.viewer_user_id::text
            || cp.opinion_id::text
            || cp.assigned_for_date::text
          ),
          cp.opinion_id
      ) as row_num
    from candidate_pairs cp
  ),
  inserted as (
    insert into public.opinion_assignments (opinion_id, viewer_user_id, assigned_for_date)
    select
      r.opinion_id,
      r.viewer_user_id,
      r.assigned_for_date
    from ranked r
    where r.row_num <= max_assignments_per_viewer
    on conflict (opinion_id, viewer_user_id, assigned_for_date) do nothing
    returning 1
  )
  select
    coalesce((select count(*)::int from candidate_pairs), 0),
    coalesce((select count(*)::int from inserted), 0)
  into
    v_candidate_pairs,
    v_inserted_rows;

  return query
  select
    target_vote_date,
    v_source_opinion_date,
    v_candidate_pairs,
    v_inserted_rows;
end;
$$;

-- IMPORTANT:
-- If a new daily task is introduced, add it here only after explicit product confirmation
-- that it should run in the automated midnight cadence.
create or replace function public.system_run_daily_cadence(
  p_target_close_date date default (public.app_current_date_est() - 1),
  p_target_vote_date date default public.app_current_date_est()
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
  v_lock_acquired boolean;
  v_assignment_candidates int := 0;
  v_assignment_inserted int := 0;
begin
  if auth.uid() is null and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Admin access required';
  end if;

  if auth.uid() is not null then
    perform public.assert_admin();
  end if;

  if p_target_close_date is null or p_target_vote_date is null then
    raise exception 'Target dates are required';
  end if;

  if p_target_vote_date <> (p_target_close_date + 1) then
    raise exception
      'target_vote_date (%) must equal target_close_date + 1 (%)',
      p_target_vote_date,
      p_target_close_date + 1;
  end if;

  v_lock_acquired := pg_try_advisory_xact_lock(
    hashtextextended('flagplant_daily_cadence', 0)
  );
  if not v_lock_acquired then
    return query
    select
      'daily_cadence_lock'::text,
      'skipped'::text,
      'another cadence run is already in progress'::text,
      0::int;
    return;
  end if;

  return query
  select *
  from public.admin_run_daily_close(p_target_close_date);

  select
    coalesce(r.result_candidate_pairs, 0),
    coalesce(r.result_inserted_rows, 0)
  into
    v_assignment_candidates,
    v_assignment_inserted
  from public.admin_generate_vote_assignments(p_target_vote_date, 5) r;

  return query
  select
    'generate_vote_assignments'::text,
    'success'::text,
    format(
      'vote_date=%s source_opinion_date=%s candidates=%s inserted=%s',
      p_target_vote_date,
      p_target_close_date,
      v_assignment_candidates,
      v_assignment_inserted
    )::text,
    v_assignment_inserted::int;

  return query
  select
    'daily_cadence'::text,
    'success'::text,
    format('close_date=%s vote_date=%s', p_target_close_date, p_target_vote_date)::text,
    1::int;
end;
$$;

create or replace function public.system_run_daily_cadence_on_schedule()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now_et timestamp;
  v_target_vote_date date;
  v_target_close_date date;
  v_hour int;
  v_minute int;
begin
  v_now_et := now() at time zone 'America/New_York';
  v_hour := extract(hour from v_now_et)::int;
  v_minute := extract(minute from v_now_et)::int;

  -- Run only in the midnight ET window. Scheduler ticks every minute and retries.
  if v_hour <> 0 or v_minute > 4 then
    return format(
      'skip:outside_midnight_window now_et=%s',
      to_char(v_now_et, 'YYYY-MM-DD HH24:MI:SS')
    );
  end if;

  v_target_vote_date := v_now_et::date;
  v_target_close_date := v_target_vote_date - 1;

  perform 1
  from public.system_run_daily_cadence(v_target_close_date, v_target_vote_date);

  return format(
    'ok:close_date=%s vote_date=%s',
    v_target_close_date,
    v_target_vote_date
  );
end;
$$;

revoke all on function public.admin_generate_vote_assignments(date, int) from public;
grant execute on function public.admin_generate_vote_assignments(date, int) to authenticated;

revoke all on function public.system_run_daily_cadence(date, date) from public;
grant execute on function public.system_run_daily_cadence(date, date) to authenticated;

revoke all on function public.system_run_daily_cadence_on_schedule() from public;
grant execute on function public.system_run_daily_cadence_on_schedule() to postgres;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select j.jobid::bigint
    from cron.job j
    where j.jobname = 'flagplant-daily-cadence-et'
  loop
    perform cron.unschedule(v_job_id::int);
  end loop;

  perform cron.schedule(
    'flagplant-daily-cadence-et',
    '* * * * *',
    $job$select public.system_run_daily_cadence_on_schedule();$job$
  );
end;
$$;
