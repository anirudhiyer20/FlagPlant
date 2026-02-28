-- Dev helper: assign up to 5 random opinions for each user.
-- Voting cadence:
-- - users submit on day D
-- - users vote on day D+1 for day D opinions
-- This script assigns yesterday's opinions to today's vote date in ET.
-- Run this in Supabase SQL Editor after multiple users have posted opinions.

create or replace function public.app_current_date_est()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/New_York')::date
$$;

with config as (
  select
    public.app_current_date_est() as vote_date,
    (
      public.app_current_date_est() - 1
    ) as source_opinion_date,
    coalesce(
      (
      select count(*)
      from public.opinions o
      where o.submitted_for_date = (public.app_current_date_est() - 1)
        and o.status = 'active'
      ),
      0
    ) as source_count,
    coalesce(
      (
      select max(o.submitted_for_date)
      from public.opinions o
      where o.status = 'active'
      ),
      (public.app_current_date_est() - 1)
    ) as fallback_source_date
),
today_opinions as (
  select o.id, o.user_id, o.submitted_for_date
  from public.opinions o
  where o.submitted_for_date = (
    select
      case
        when c.source_count > 0 then c.source_opinion_date
        else c.fallback_source_date
      end
    from config c
  )
    and o.status = 'active'
),
viewer_pool as (
  select p.id as viewer_user_id
  from public.profiles p
),
candidate_pairs as (
  select
    tp.id as opinion_id,
    vp.viewer_user_id,
    (select vote_date from config) as assigned_for_date
  from today_opinions tp
  cross join viewer_pool vp
  where tp.user_id <> vp.viewer_user_id
),
ranked as (
  select
    cp.*,
    row_number() over (
      partition by cp.viewer_user_id, cp.assigned_for_date
      order by random()
    ) as row_num
  from candidate_pairs cp
)
insert into public.opinion_assignments (opinion_id, viewer_user_id, assigned_for_date)
select
  r.opinion_id,
  r.viewer_user_id,
  r.assigned_for_date
from ranked r
where r.row_num <= 5
on conflict (opinion_id, viewer_user_id, assigned_for_date) do nothing;

-- Optional check:
-- select viewer_user_id, assigned_for_date, count(*) as assignment_count
-- from public.opinion_assignments
-- where assigned_for_date = public.app_current_date_est()
-- group by viewer_user_id, assigned_for_date
-- order by assignment_count desc;
