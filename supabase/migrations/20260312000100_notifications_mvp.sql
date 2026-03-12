-- Notifications MVP:
-- - in-app notifications table
-- - read/unread RPCs
-- - automatic event hooks for order status, winner publish, and vote assignments

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (char_length(btrim(event_type)) between 2 and 64),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  body text not null check (char_length(btrim(body)) between 1 and 280),
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_notifications_user_created
  on public.user_notifications (user_id, created_at desc);

create index if not exists idx_user_notifications_user_unread
  on public.user_notifications (user_id, created_at desc)
  where read_at is null;

create unique index if not exists uq_user_notifications_user_dedupe
  on public.user_notifications (user_id, dedupe_key);

alter table public.user_notifications enable row level security;

drop policy if exists user_notifications_select_own on public.user_notifications;
create policy user_notifications_select_own
on public.user_notifications
for select
using (auth.uid() = user_id);

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
begin
  if p_user_id is null then
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
      btrim(p_event_type),
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
    btrim(p_event_type),
    btrim(p_title),
    btrim(p_body),
    coalesce(p_payload, '{}'::jsonb),
    btrim(p_dedupe_key)
  )
  on conflict (user_id, dedupe_key) do nothing;
end;
$$;

create or replace function public.get_notifications_page(
  limit_count int default 25,
  offset_count int default 0,
  unread_only boolean default false
)
returns table (
  result_id uuid,
  result_event_type text,
  result_title text,
  result_body text,
  result_payload jsonb,
  result_read_at timestamptz,
  result_created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  clamped_limit int;
  clamped_offset int;
  only_unread boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  clamped_limit := greatest(1, least(coalesce(limit_count, 25), 100));
  clamped_offset := greatest(0, coalesce(offset_count, 0));
  only_unread := coalesce(unread_only, false);

  return query
  select
    n.id as result_id,
    n.event_type as result_event_type,
    n.title as result_title,
    n.body as result_body,
    n.payload as result_payload,
    n.read_at as result_read_at,
    n.created_at as result_created_at
  from public.user_notifications n
  where n.user_id = auth.uid()
    and (not only_unread or n.read_at is null)
  order by n.created_at desc, n.id desc
  limit clamped_limit
  offset clamped_offset;
end;
$$;

create or replace function public.get_unread_notification_count()
returns table (
  result_unread_count int
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
  select count(*)::int as result_unread_count
  from public.user_notifications n
  where n.user_id = auth.uid()
    and n.read_at is null;
end;
$$;

create or replace function public.mark_notification_read(
  target_notification_id uuid
)
returns table (
  result_updated boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_rows int;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if target_notification_id is null then
    raise exception 'target_notification_id is required';
  end if;

  update public.user_notifications n
  set read_at = coalesce(n.read_at, now())
  where n.id = target_notification_id
    and n.user_id = auth.uid();

  get diagnostics updated_rows = row_count;

  return query
  select (updated_rows > 0) as result_updated;
end;
$$;

create or replace function public.mark_all_notifications_read()
returns table (
  result_updated_count int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_rows int;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.user_notifications n
  set read_at = now()
  where n.user_id = auth.uid()
    and n.read_at is null;

  get diagnostics updated_rows = row_count;

  return query
  select updated_rows::int as result_updated_count;
end;
$$;

create or replace function public.delete_notification(
  target_notification_id uuid
)
returns table (
  result_deleted boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_rows int;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if target_notification_id is null then
    raise exception 'target_notification_id is required';
  end if;

  delete from public.user_notifications n
  where n.id = target_notification_id
    and n.user_id = auth.uid();

  get diagnostics deleted_rows = row_count;

  return query
  select (deleted_rows > 0) as result_deleted;
end;
$$;

create or replace function public.tg_notify_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player_name text;
  v_title text;
  v_body text;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status not in ('executed', 'failed', 'cancelled') then
    return new;
  end if;

  select p.name
  into v_player_name
  from public.players p
  where p.id = new.player_id;

  if new.status = 'executed' then
    v_title := 'Order Executed';
  elsif new.status = 'failed' then
    v_title := 'Order Failed';
  else
    v_title := 'Order Cancelled';
  end if;

  v_body := format(
    '%s %s order for %s Flags.',
    coalesce(v_player_name, 'Player'),
    upper(new.order_type::text),
    to_char(coalesce(new.flags_amount, 0)::numeric, 'FM999999990.00')
  );

  perform public.enqueue_user_notification(
    new.user_id,
    format('order_%s', new.status),
    v_title,
    v_body,
    jsonb_build_object(
      'order_id', new.id,
      'player_id', new.player_id,
      'order_type', new.order_type,
      'status', new.status,
      'trade_date', new.trade_date
    ),
    format('order:%s:%s', new.id, new.status)
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_order_status_change on public.orders;
create trigger trg_notify_order_status_change
after update of status on public.orders
for each row
execute function public.tg_notify_order_status_change();

create or replace function public.tg_notify_daily_winner_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.enqueue_user_notification(
    new.user_id,
    'winner_published',
    'Winner Result Published',
    format(
      'You placed rank %s on %s and earned %s Flags.',
      new.rank,
      to_char(new.winner_date, 'Mon-DD'),
      to_char(new.reward_flags::numeric, 'FM999999990.00')
    ),
    jsonb_build_object(
      'winner_date', new.winner_date,
      'rank', new.rank,
      'opinion_id', new.opinion_id,
      'votes_received', new.votes_received,
      'reward_flags', new.reward_flags
    ),
    format('winner:%s:%s:%s', new.winner_date, new.rank, new.user_id)
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_daily_winner_insert on public.daily_winners;
create trigger trg_notify_daily_winner_insert
after insert on public.daily_winners
for each row
execute function public.tg_notify_daily_winner_insert();

create or replace function public.tg_notify_vote_assignment_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.enqueue_user_notification(
    new.viewer_user_id,
    'vote_assignments_available',
    'Vote Assignments Ready',
    format(
      'New opinions are ready for voting on %s.',
      to_char(new.assigned_for_date, 'Mon-DD')
    ),
    jsonb_build_object(
      'assigned_for_date', new.assigned_for_date
    ),
    format('assignments:%s', new.assigned_for_date)
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_vote_assignment_insert on public.opinion_assignments;
create trigger trg_notify_vote_assignment_insert
after insert on public.opinion_assignments
for each row
execute function public.tg_notify_vote_assignment_insert();

revoke all on function public.enqueue_user_notification(uuid, text, text, text, jsonb, text) from public;

revoke all on function public.get_notifications_page(int, int, boolean) from public;
grant execute on function public.get_notifications_page(int, int, boolean) to authenticated;

revoke all on function public.get_unread_notification_count() from public;
grant execute on function public.get_unread_notification_count() to authenticated;

revoke all on function public.mark_notification_read(uuid) from public;
grant execute on function public.mark_notification_read(uuid) to authenticated;

revoke all on function public.mark_all_notifications_read() from public;
grant execute on function public.mark_all_notifications_read() to authenticated;

revoke all on function public.delete_notification(uuid) from public;
grant execute on function public.delete_notification(uuid) to authenticated;
