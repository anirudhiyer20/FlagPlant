-- Patch for existing projects:
-- adds paginated/searchable/sortable follower/following list RPCs.

drop function if exists public.get_follow_list_page(uuid, text, text, int, int);
drop function if exists public.get_follow_list_page(uuid, text, text, text, boolean, int, int);
drop function if exists public.get_follow_list_count(uuid, text, text);
drop function if exists public.get_follow_list_count(uuid, text, text, boolean);

create or replace function public.get_follow_list_page(
  target_user_id uuid,
  list_kind text default 'following',
  search_query text default null,
  sort_kind text default 'newest',
  only_mutuals boolean default false,
  limit_count int default 25,
  offset_count int default 0
)
returns table (
  result_user_id uuid,
  result_username text,
  result_net_worth numeric(18,6),
  result_is_following boolean,
  result_follows_you boolean,
  result_followed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  clamped_limit int;
  clamped_offset int;
  normalized_search text;
  normalized_sort text;
  mutual_only boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  clamped_limit := greatest(1, least(coalesce(limit_count, 25), 100));
  clamped_offset := greatest(0, coalesce(offset_count, 0));
  normalized_search := nullif(btrim(search_query), '');
  normalized_sort := lower(coalesce(sort_kind, 'newest'));
  mutual_only := coalesce(only_mutuals, false);

  if normalized_sort not in ('newest', 'oldest', 'net_worth') then
    normalized_sort := 'newest';
  end if;

  if list_kind = 'followers' then
    return query
    with connection_rows as (
      select
        uf.follower_user_id as result_user_id,
        p.username as result_username,
        uf.created_at as result_followed_at
      from public.user_follows uf
      join public.profiles p on p.id = uf.follower_user_id
      where uf.followed_user_id = target_user_id
        and (
          normalized_search is null
          or p.username ilike ('%' || normalized_search || '%')
        )
        and (
          not mutual_only
          or exists (
            select 1
            from public.user_follows uf_mutual
            where uf_mutual.follower_user_id = uf.follower_user_id
              and uf_mutual.followed_user_id = auth.uid()
          )
        )
    ),
    holdings_agg as (
      select
        hd.user_id,
        coalesce(sum(hd.units * pl.current_price), 0::numeric)::numeric(18,6) as holdings_value
      from public.holdings hd
      join public.players pl on pl.id = hd.player_id
      join connection_rows c on c.result_user_id = hd.user_id
      where hd.units > 0.005::numeric
      group by hd.user_id
    ),
    enriched as (
      select
        c.result_user_id,
        c.result_username,
        (
          coalesce(w.liquid_flags, 0::numeric(18,6))
          + coalesce(h.holdings_value, 0::numeric(18,6))
        )::numeric(18,6) as result_net_worth,
        exists (
          select 1
          from public.user_follows uf_auth
          where uf_auth.follower_user_id = auth.uid()
            and uf_auth.followed_user_id = c.result_user_id
        ) as result_is_following,
        exists (
          select 1
          from public.user_follows uf_auth
          where uf_auth.follower_user_id = c.result_user_id
            and uf_auth.followed_user_id = auth.uid()
        ) as result_follows_you,
        c.result_followed_at
      from connection_rows c
      left join public.wallets w on w.user_id = c.result_user_id
      left join holdings_agg h on h.user_id = c.result_user_id
    )
    select
      e.result_user_id,
      e.result_username,
      e.result_net_worth,
      e.result_is_following,
      e.result_follows_you,
      e.result_followed_at
    from enriched e
    order by
      case when normalized_sort = 'oldest' then e.result_followed_at end asc,
      case when normalized_sort = 'newest' then e.result_followed_at end desc,
      case when normalized_sort = 'net_worth' then e.result_net_worth end desc,
      e.result_username asc,
      e.result_followed_at desc
    limit clamped_limit
    offset clamped_offset;
    return;
  end if;

  if list_kind = 'following' then
    return query
    with connection_rows as (
      select
        uf.followed_user_id as result_user_id,
        p.username as result_username,
        uf.created_at as result_followed_at
      from public.user_follows uf
      join public.profiles p on p.id = uf.followed_user_id
      where uf.follower_user_id = target_user_id
        and (
          normalized_search is null
          or p.username ilike ('%' || normalized_search || '%')
        )
        and (
          not mutual_only
          or exists (
            select 1
            from public.user_follows uf_mutual
            where uf_mutual.follower_user_id = uf.followed_user_id
              and uf_mutual.followed_user_id = auth.uid()
          )
        )
    ),
    holdings_agg as (
      select
        hd.user_id,
        coalesce(sum(hd.units * pl.current_price), 0::numeric)::numeric(18,6) as holdings_value
      from public.holdings hd
      join public.players pl on pl.id = hd.player_id
      join connection_rows c on c.result_user_id = hd.user_id
      where hd.units > 0.005::numeric
      group by hd.user_id
    ),
    enriched as (
      select
        c.result_user_id,
        c.result_username,
        (
          coalesce(w.liquid_flags, 0::numeric(18,6))
          + coalesce(h.holdings_value, 0::numeric(18,6))
        )::numeric(18,6) as result_net_worth,
        exists (
          select 1
          from public.user_follows uf_auth
          where uf_auth.follower_user_id = auth.uid()
            and uf_auth.followed_user_id = c.result_user_id
        ) as result_is_following,
        exists (
          select 1
          from public.user_follows uf_auth
          where uf_auth.follower_user_id = c.result_user_id
            and uf_auth.followed_user_id = auth.uid()
        ) as result_follows_you,
        c.result_followed_at
      from connection_rows c
      left join public.wallets w on w.user_id = c.result_user_id
      left join holdings_agg h on h.user_id = c.result_user_id
    )
    select
      e.result_user_id,
      e.result_username,
      e.result_net_worth,
      e.result_is_following,
      e.result_follows_you,
      e.result_followed_at
    from enriched e
    order by
      case when normalized_sort = 'oldest' then e.result_followed_at end asc,
      case when normalized_sort = 'newest' then e.result_followed_at end desc,
      case when normalized_sort = 'net_worth' then e.result_net_worth end desc,
      e.result_username asc,
      e.result_followed_at desc
    limit clamped_limit
    offset clamped_offset;
    return;
  end if;

  raise exception 'Invalid list_kind: %, expected followers or following', list_kind;
end;
$$;

create or replace function public.get_follow_list_count(
  target_user_id uuid,
  list_kind text default 'following',
  search_query text default null,
  only_mutuals boolean default false
)
returns table (
  result_total_count int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_search text;
  mutual_only boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  normalized_search := nullif(btrim(search_query), '');
  mutual_only := coalesce(only_mutuals, false);

  if list_kind = 'followers' then
    return query
    select count(*)::int as result_total_count
    from public.user_follows uf
    join public.profiles p on p.id = uf.follower_user_id
    where uf.followed_user_id = target_user_id
      and (
        normalized_search is null
        or p.username ilike ('%' || normalized_search || '%')
      )
      and (
        not mutual_only
        or exists (
          select 1
          from public.user_follows uf_mutual
          where uf_mutual.follower_user_id = uf.follower_user_id
            and uf_mutual.followed_user_id = auth.uid()
        )
      );
    return;
  end if;

  if list_kind = 'following' then
    return query
    select count(*)::int as result_total_count
    from public.user_follows uf
    join public.profiles p on p.id = uf.followed_user_id
    where uf.follower_user_id = target_user_id
      and (
        normalized_search is null
        or p.username ilike ('%' || normalized_search || '%')
      )
      and (
        not mutual_only
        or exists (
          select 1
          from public.user_follows uf_mutual
          where uf_mutual.follower_user_id = uf.followed_user_id
            and uf_mutual.followed_user_id = auth.uid()
        )
      );
    return;
  end if;

  raise exception 'Invalid list_kind: %, expected followers or following', list_kind;
end;
$$;

revoke all on function public.get_follow_list_page(uuid, text, text, text, boolean, int, int) from public;
grant execute on function public.get_follow_list_page(uuid, text, text, text, boolean, int, int) to authenticated;

revoke all on function public.get_follow_list_count(uuid, text, text, boolean) from public;
grant execute on function public.get_follow_list_count(uuid, text, text, boolean) to authenticated;
