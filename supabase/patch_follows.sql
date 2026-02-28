-- Patch for existing projects:
-- adds follow/unfollow social graph tables + RPCs.

create table if not exists public.user_follows (
  follower_user_id uuid not null references public.profiles(id) on delete cascade,
  followed_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_user_id, followed_user_id),
  check (follower_user_id <> followed_user_id)
);

create index if not exists idx_user_follows_followed on public.user_follows (followed_user_id);
create index if not exists idx_user_follows_follower on public.user_follows (follower_user_id);

alter table public.user_follows enable row level security;

drop policy if exists follows_select_involved on public.user_follows;
create policy follows_select_involved
on public.user_follows
for select
using (
  auth.uid() = follower_user_id
  or auth.uid() = followed_user_id
);

drop policy if exists follows_insert_own on public.user_follows;
create policy follows_insert_own
on public.user_follows
for insert
with check (
  auth.uid() = follower_user_id
  and follower_user_id <> followed_user_id
);

drop policy if exists follows_delete_own on public.user_follows;
create policy follows_delete_own
on public.user_follows
for delete
using (auth.uid() = follower_user_id);

create or replace function public.get_follow_state(target_user_id uuid)
returns table (
  result_target_user_id uuid,
  result_is_following boolean,
  result_follows_you boolean,
  result_follower_count int,
  result_following_count int
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
  select
    target_user_id as result_target_user_id,
    exists (
      select 1
      from public.user_follows uf
      where uf.follower_user_id = auth.uid()
        and uf.followed_user_id = target_user_id
    ) as result_is_following,
    exists (
      select 1
      from public.user_follows uf
      where uf.follower_user_id = target_user_id
        and uf.followed_user_id = auth.uid()
    ) as result_follows_you,
    (
      select count(*)::int
      from public.user_follows uf
      where uf.followed_user_id = target_user_id
    ) as result_follower_count,
    (
      select count(*)::int
      from public.user_follows uf
      where uf.follower_user_id = target_user_id
    ) as result_following_count;
end;
$$;

create or replace function public.follow_user(target_user_id uuid)
returns table (
  result_target_user_id uuid,
  result_following boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if target_user_id is null then
    raise exception 'Target user id is required';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'Cannot follow yourself';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = target_user_id
  ) then
    raise exception 'Target user does not exist';
  end if;

  insert into public.user_follows (follower_user_id, followed_user_id)
  values (auth.uid(), target_user_id)
  on conflict (follower_user_id, followed_user_id) do nothing;

  return query
  select target_user_id, true;
end;
$$;

create or replace function public.unfollow_user(target_user_id uuid)
returns table (
  result_target_user_id uuid,
  result_following boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if target_user_id is null then
    raise exception 'Target user id is required';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'Cannot unfollow yourself';
  end if;

  delete from public.user_follows uf
  where uf.follower_user_id = auth.uid()
    and uf.followed_user_id = target_user_id;

  return query
  select target_user_id, false;
end;
$$;

create or replace function public.get_follow_list(
  target_user_id uuid,
  list_kind text default 'following',
  limit_count int default 25
)
returns table (
  result_user_id uuid,
  result_username text,
  result_followed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  clamped_limit int;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  clamped_limit := greatest(1, least(coalesce(limit_count, 25), 100));

  if list_kind = 'followers' then
    return query
    select
      uf.follower_user_id as result_user_id,
      p.username as result_username,
      uf.created_at as result_followed_at
    from public.user_follows uf
    join public.profiles p on p.id = uf.follower_user_id
    where uf.followed_user_id = target_user_id
    order by uf.created_at desc, p.username asc
    limit clamped_limit;
    return;
  end if;

  if list_kind = 'following' then
    return query
    select
      uf.followed_user_id as result_user_id,
      p.username as result_username,
      uf.created_at as result_followed_at
    from public.user_follows uf
    join public.profiles p on p.id = uf.followed_user_id
    where uf.follower_user_id = target_user_id
    order by uf.created_at desc, p.username asc
    limit clamped_limit;
    return;
  end if;

  raise exception 'Invalid list_kind: %, expected followers or following', list_kind;
end;
$$;

revoke all on function public.get_follow_state(uuid) from public;
grant execute on function public.get_follow_state(uuid) to authenticated;

revoke all on function public.follow_user(uuid) from public;
grant execute on function public.follow_user(uuid) to authenticated;

revoke all on function public.unfollow_user(uuid) from public;
grant execute on function public.unfollow_user(uuid) to authenticated;

revoke all on function public.get_follow_list(uuid, text, int) from public;
grant execute on function public.get_follow_list(uuid, text, int) to authenticated;
