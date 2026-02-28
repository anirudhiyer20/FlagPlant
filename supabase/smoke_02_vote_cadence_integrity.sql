-- Smoke test 02: D -> D+1 voting cadence integrity
-- Run in Supabase SQL Editor.

-- A) Any opinions where submitted_for_date does not match ET-created date?
select count(*) as mismatched_opinion_business_date
from public.opinions o
where o.submitted_for_date is distinct from (o.created_at at time zone 'America/New_York')::date;

-- B) Any assignments not equal to submitted_for_date + 1?
select count(*) as mismatched_assignments
from public.opinion_assignments oa
join public.opinions o on o.id = oa.opinion_id
where oa.assigned_for_date <> (o.submitted_for_date + 1);

-- C) Any votes not equal to submitted_for_date + 1?
select count(*) as mismatched_votes
from public.opinion_votes ov
join public.opinions o on o.id = ov.opinion_id
where ov.assigned_for_date <> (o.submitted_for_date + 1);

-- D) Quick date distribution sanity.
select submitted_for_date, count(*) as opinion_count
from public.opinions
group by submitted_for_date
order by submitted_for_date desc
limit 14;

select assigned_for_date, count(*) as assignment_count
from public.opinion_assignments
group by assigned_for_date
order by assigned_for_date desc
limit 14;
