-- Notifications add-ons:
-- - user-level notification preferences
-- - retention cleanup functions + cron schedule
-- - enqueue function honors user preference opt-outs

create table if not exists public.user_notification_preferences (
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, event_type),
  constraint user_notification_preferences_event_type_chk check (
    event_type = any (
      array[
        'order_executed'::text,
        'order_failed'::text,
        'order_cancelled'::text,
        'winner_published'::text,
        'vote_assignments_available'::text
      ]
    )
  )
);

create index if not exists idx_user_notification_preferences_user
  on public.user_notification_preferences (user_id);

alter table public.user_notification_preferences enable row level security;

drop policy if exists user_notification_preferences_select_own on public.user_notification_preferences;
create policy user_notification_preferences_select_own
on public.user_notification_preferences
for select
using (auth.uid() = user_id);

drop policy if exists user_notification_preferences_insert_own on public.user_notification_preferences;
create policy user_notification_preferences_insert_own
on public.user_notification_preferences
for insert
with check (auth.uid() = user_id);

drop policy if exists user_notification_preferences_update_own on public.user_notification_preferences;
create policy user_notification_preferences_update_own
on public.user_notification_preferences
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists user_notification_preferences_delete_own on public.user_notification_preferences;
create policy user_notification_preferences_delete_own
on public.user_notification_preferences
for delete
using (auth.uid() = user_id);

create or replace function public.get_notification_preferences()
returns table (
  result_event_type text,
  result_enabled boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  return query
  with known_events(event_type) as (
    values
      ('order_executed'::text),
      ('order_failed'::text),
      ('order_cancelled'::text),
      ('winner_published'::text),
      ('vote_assignments_available'::text)
  )
  select
    k.event_type as result_event_type,
    coalesce(p.enabled, true) as result_enabled
  from known_events k
  left join public.user_notification_preferences p
    on p.user_id = auth.uid()
   and p.event_type = k.event_type
  order by k.event_type;
end;
$$;

create or replace function public.set_notification_preference(
  target_event_type text,
  target_enabled boolean default true
)
returns table (
  result_event_type text,
  result_enabled boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_event_type text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  normalized_event_type := lower(nullif(btrim(target_event_type), ''));

  if normalized_event_type is null then
    raise exception 'target_event_type is required';
  end if;

  if normalized_event_type <> all (
    array[
      'order_executed'::text,
      'order_failed'::text,
      'order_cancelled'::text,
      'winner_published'::text,
      'vote_assignments_available'::text
    ]
  ) then
    raise exception
      'target_event_type must be one of order_executed, order_failed, order_cancelled, winner_published, vote_assignments_available';
  end if;

  return query
  insert into public.user_notification_preferences (
    user_id,
    event_type,
    enabled,
    updated_at
  )
  values (
    auth.uid(),
    normalized_event_type,
    coalesce(target_enabled, true),
    now()
  )
  on conflict (user_id, event_type) do update
    set enabled = excluded.enabled,
        updated_at = now()
  returning
    event_type as result_event_type,
    enabled as result_enabled;
end;
$$;

create or replace function public.enqueue_user_notification(
  p_user_id uuid,
  p_event_type text,
  p_title text,
  p_body text,
  p_payload jsonb default '{}'::jsonb,
  p_dedupe_key text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_event_type text;
begin
  if p_user_id is null then
    return;
  end if;

  normalized_event_type := lower(nullif(btrim(p_event_type), ''));
  if normalized_event_type is null then
    return;
  end if;

  if exists (
    select 1
    from public.user_notification_preferences pref
    where pref.user_id = p_user_id
      and pref.event_type = normalized_event_type
      and pref.enabled = false
  ) then
    return;
  end if;

  if p_dedupe_key is null then
    insert into public.user_notifications (
      user_id,
      event_type,
      title,
      body,
      payload
    )
    values (
      p_user_id,
      normalized_event_type,
      btrim(p_title),
      btrim(p_body),
      coalesce(p_payload, '{}'::jsonb)
    );
    return;
  end if;

  insert into public.user_notifications (
    user_id,
    event_type,
    title,
    body,
    payload,
    dedupe_key
  )
  values (
    p_user_id,
    normalized_event_type,
    btrim(p_title),
    btrim(p_body),
    coalesce(p_payload, '{}'::jsonb),
    btrim(p_dedupe_key)
  )
  on conflict (user_id, dedupe_key) do nothing;
end;
$$;

create or replace function public.system_purge_old_notifications(
  retention_days int default 60
)
returns table (
  result_deleted_count int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  clamped_days int;
  deleted_rows int;
begin
  clamped_days := greatest(7, least(coalesce(retention_days, 60), 365));

  delete from public.user_notifications n
  where n.created_at < (now() - make_interval(days => clamped_days));

  get diagnostics deleted_rows = row_count;

  return query
  select deleted_rows::int as result_deleted_count;
end;
$$;

create or replace function public.admin_purge_old_notifications(
  retention_days int default 60
)
returns table (
  result_deleted_count int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin();

  return query
  select p.result_deleted_count
  from public.system_purge_old_notifications(retention_days) p;
end;
$$;

do $$
declare
  v_job_id bigint;
begin
  if to_regclass('cron.job') is not null then
    for v_job_id in
      select j.jobid::bigint
      from cron.job j
      where j.jobname = 'flagplant-notifications-retention'
    loop
      perform cron.unschedule(v_job_id::int);
    end loop;

    perform cron.schedule(
      'flagplant-notifications-retention',
      '15 6 * * *',
      $job$select public.system_purge_old_notifications(60);$job$
    );
  end if;
end;
$$;

revoke all on function public.get_notification_preferences() from public;
grant execute on function public.get_notification_preferences() to authenticated;

revoke all on function public.set_notification_preference(text, boolean) from public;
grant execute on function public.set_notification_preference(text, boolean) to authenticated;

revoke all on function public.system_purge_old_notifications(int) from public;
grant execute on function public.system_purge_old_notifications(int) to postgres;

revoke all on function public.admin_purge_old_notifications(int) from public;
grant execute on function public.admin_purge_old_notifications(int) to authenticated;

revoke all on function public.enqueue_user_notification(uuid, text, text, text, jsonb, text) from public;

