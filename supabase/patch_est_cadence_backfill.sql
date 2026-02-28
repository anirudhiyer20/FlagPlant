-- One-time patch for existing projects:
-- normalizes existing opinion/vote date fields to ET cadence.
--
-- Cadence standard:
-- - submit opinion on day D (ET)
-- - vote on day D+1 (ET) for day D opinions
-- - winner_date corresponds to vote date (ET)

create or replace function public.app_current_date_est()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/New_York')::date
$$;

begin;

-- 1) Normalize submitted_for_date from created_at (interpreted in ET).
update public.opinions o
set submitted_for_date = (o.created_at at time zone 'America/New_York')::date
where o.submitted_for_date is distinct from (o.created_at at time zone 'America/New_York')::date;

-- 2) Realign assignments to D+1 of their opinion's submitted_for_date.
with expected as (
  select
    oa.id,
    oa.opinion_id,
    oa.viewer_user_id,
    (o.submitted_for_date + 1) as expected_date
  from public.opinion_assignments oa
  join public.opinions o on o.id = oa.opinion_id
  where oa.assigned_for_date is distinct from (o.submitted_for_date + 1)
),
safe_updates as (
  select e.*
  from expected e
  where not exists (
    select 1
    from public.opinion_assignments oa2
    where oa2.opinion_id = e.opinion_id
      and oa2.viewer_user_id = e.viewer_user_id
      and oa2.assigned_for_date = e.expected_date
  )
)
update public.opinion_assignments oa
set assigned_for_date = su.expected_date
from safe_updates su
where oa.id = su.id;

delete from public.opinion_assignments oa
using public.opinions o
where oa.opinion_id = o.id
  and oa.assigned_for_date is distinct from (o.submitted_for_date + 1);

-- 3) Realign votes to D+1 of their opinion's submitted_for_date.
with expected as (
  select
    ov.id,
    ov.opinion_id,
    ov.voter_user_id,
    (o.submitted_for_date + 1) as expected_date
  from public.opinion_votes ov
  join public.opinions o on o.id = ov.opinion_id
  where ov.assigned_for_date is distinct from (o.submitted_for_date + 1)
),
safe_updates as (
  select e.*
  from expected e
  where not exists (
    select 1
    from public.opinion_votes ov2
    where ov2.opinion_id = e.opinion_id
      and ov2.voter_user_id = e.voter_user_id
      and ov2.assigned_for_date = e.expected_date
  )
)
update public.opinion_votes ov
set assigned_for_date = su.expected_date
from safe_updates su
where ov.id = su.id;

delete from public.opinion_votes ov
using public.opinions o
where ov.opinion_id = o.id
  and ov.assigned_for_date is distinct from (o.submitted_for_date + 1);

-- 4) Realign winner_date to D+1 of the winning opinion's submitted_for_date
-- when that target key is not already occupied.
with expected as (
  select
    dw.winner_date,
    dw.rank,
    dw.user_id,
    dw.opinion_id,
    (o.submitted_for_date + 1) as expected_date
  from public.daily_winners dw
  join public.opinions o on o.id = dw.opinion_id
  where dw.winner_date is distinct from (o.submitted_for_date + 1)
),
safe_updates as (
  select e.*
  from expected e
  where not exists (
    select 1
    from public.daily_winners dw2
    where dw2.winner_date = e.expected_date
      and dw2.rank = e.rank
      and dw2.user_id = e.user_id
  )
)
update public.daily_winners dw
set winner_date = su.expected_date
from safe_updates su
where dw.winner_date = su.winner_date
  and dw.rank = su.rank
  and dw.user_id = su.user_id
  and dw.opinion_id = su.opinion_id;

commit;

-- Validation queries:
-- select o.id, o.submitted_for_date, (o.created_at at time zone 'America/New_York')::date as et_created_date
-- from public.opinions o
-- order by o.created_at desc
-- limit 25;
--
-- select count(*) as bad_assignments
-- from public.opinion_assignments oa
-- join public.opinions o on o.id = oa.opinion_id
-- where oa.assigned_for_date <> (o.submitted_for_date + 1);
--
-- select count(*) as bad_votes
-- from public.opinion_votes ov
-- join public.opinions o on o.id = ov.opinion_id
-- where ov.assigned_for_date <> (o.submitted_for_date + 1);
