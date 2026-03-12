-- Smoke test 01: admin daily close execution
-- Run in Supabase SQL Editor.

-- 1) Verify at least one admin exists.
select id, email, role
from public.profiles
where role = 'admin'
order by created_at asc;

-- 2) Set SQL session auth context to first admin (if present).
-- If no admin profile exists, keep auth.uid() null so postgres/supabase_admin
-- can still execute admin function checks via assert_admin() bypass.
do $$
declare
  admin_id text;
begin
  select p.id::text
  into admin_id
  from public.profiles p
  where p.role = 'admin'
  order by p.created_at asc
  limit 1;

  if admin_id is null then
    raise notice 'No admin profile row found; running checks as postgres/supabase_admin.';
  else
    perform set_config('request.jwt.claim.sub', admin_id, false);
    perform set_config('request.jwt.claim.role', 'authenticated', false);
  end if;
end
$$;

-- 3) Verify context.
select auth.uid() as acting_user_id;

-- 4) Execute daily close for ET app day.
select * from public.admin_run_daily_close(public.app_current_date_est());

-- 5) Confirm job state.
select job_date, job_type, status, started_at, finished_at
from public.system_jobs
where job_date = public.app_current_date_est()
order by job_type asc;
