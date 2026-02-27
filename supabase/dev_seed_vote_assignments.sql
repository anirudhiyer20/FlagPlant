-- Dev helper: assign up to 5 random opinions for each user.
-- It targets the most recent submitted_for_date with active opinions.
-- This avoids timezone mismatch between browser local date and DB current_date.
-- Run this in Supabase SQL Editor after multiple users have posted opinions.

with config as (
  select coalesce(
    (
      select max(o.submitted_for_date)
      from public.opinions o
      where o.status = 'active'
    ),
    current_date
  ) as target_date
),
today_opinions as (
  select o.id, o.user_id, o.submitted_for_date
  from public.opinions o
  where o.submitted_for_date = (select target_date from config)
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
    tp.submitted_for_date as assigned_for_date
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
-- where assigned_for_date = (select max(submitted_for_date) from public.opinions)
-- group by viewer_user_id, assigned_for_date
-- order by assignment_count desc;
