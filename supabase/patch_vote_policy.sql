-- Patch for existing projects:
-- allow users to read opinions that are assigned to them for voting.

alter table public.opinions enable row level security;

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
      and oa.assigned_for_date = opinions.submitted_for_date
  )
);
