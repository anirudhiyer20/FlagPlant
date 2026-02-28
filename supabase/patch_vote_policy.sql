-- Patch for existing projects:
-- enforce ET-day opinion/vote cadence and allow reading only assigned opinions.

create or replace function public.app_current_date_est()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/New_York')::date
$$;

alter table public.opinions enable row level security;
alter table public.opinion_votes enable row level security;

drop policy if exists opinions_select_assigned on public.opinions;
create policy opinions_select_assigned
on public.opinions
for select
using (
  exists (
    select 1
    from public.opinion_assignments oa
    where oa.opinion_id = opinions.id
      and oa.viewer_user_id = auth.uid()
      and oa.assigned_for_date = (opinions.submitted_for_date + 1)
  )
);

drop policy if exists opinions_insert_own on public.opinions;
create policy opinions_insert_own
on public.opinions
for insert
with check (
  auth.uid() = user_id
  and submitted_for_date = public.app_current_date_est()
);

drop policy if exists votes_insert_own on public.opinion_votes;
create policy votes_insert_own
on public.opinion_votes
for insert
with check (
  auth.uid() = voter_user_id
  and assigned_for_date = public.app_current_date_est()
  and exists (
    select 1
    from public.opinion_assignments oa
    where oa.opinion_id = opinion_votes.opinion_id
      and oa.viewer_user_id = auth.uid()
      and oa.assigned_for_date = opinion_votes.assigned_for_date
  )
);
