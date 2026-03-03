-- Patch for existing projects:
-- allow authenticated users to edit only their own opinion submitted for today (ET).

alter table public.opinions enable row level security;

drop policy if exists opinions_update_own_today on public.opinions;
create policy opinions_update_own_today
on public.opinions
for update
using (
  auth.uid() = user_id
  and submitted_for_date = public.app_current_date_est()
)
with check (
  auth.uid() = user_id
  and submitted_for_date = public.app_current_date_est()
);
