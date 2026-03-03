-- Smoke test 04: verify midnight ET cadence automation wiring.
-- Run in Supabase SQL Editor.

-- 1) Verify scheduler job exists.
select
  j.jobid,
  j.jobname,
  j.schedule,
  j.command
from cron.job j
where j.jobname = 'flagplant-daily-cadence-et';

-- 2) Verify key functions exist.
select
  n.nspname as schema_name,
  p.proname as function_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'admin_generate_vote_assignments',
    'system_run_daily_cadence',
    'system_run_daily_cadence_on_schedule'
  )
order by p.proname;

-- 3) Dry-run scheduler gate logic (safe).
-- At most times this should return "skip:outside_midnight_window ...".
select public.system_run_daily_cadence_on_schedule() as scheduler_probe;
