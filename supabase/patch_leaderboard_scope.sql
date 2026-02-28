-- Patch for existing projects:
-- adds server-side scoped leaderboard RPC (global or friends_only).

create or replace function public.get_leaderboard_snapshot_scoped(
  view_mode text default 'global'
)
returns table (
  result_rank int,
  result_user_id uuid,
  result_username text,
  result_liquid_flags numeric(18,6),
  result_holdings_value numeric(18,6),
  result_net_worth numeric(18,6),
  result_holding_count int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_mode text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  normalized_mode := lower(coalesce(view_mode, 'global'));
  if normalized_mode not in ('global', 'friends_only') then
    raise exception 'Invalid view_mode: %, expected global or friends_only', view_mode;
  end if;

  return query
  with holdings_agg as (
    select
      h.user_id,
      count(*)::int as holding_count,
      coalesce(sum(h.units * p.current_price), 0::numeric)::numeric(18,6) as holdings_value
    from public.holdings h
    join public.players p on p.id = h.player_id
    where h.units > 0.005::numeric
    group by h.user_id
  ),
  base as (
    select
      pr.id as user_id,
      pr.username,
      coalesce(w.liquid_flags, 0::numeric)::numeric(18,6) as liquid_flags,
      coalesce(ha.holdings_value, 0::numeric)::numeric(18,6) as holdings_value,
      coalesce(ha.holding_count, 0)::int as holding_count,
      (
        coalesce(w.liquid_flags, 0::numeric)
        + coalesce(ha.holdings_value, 0::numeric)
      )::numeric(18,6) as net_worth
    from public.profiles pr
    left join public.wallets w on w.user_id = pr.id
    left join holdings_agg ha on ha.user_id = pr.id
  ),
  mutual_friends as (
    select uf.followed_user_id as user_id
    from public.user_follows uf
    join public.user_follows uf_back
      on uf_back.follower_user_id = uf.followed_user_id
      and uf_back.followed_user_id = uf.follower_user_id
    where uf.follower_user_id = auth.uid()
  ),
  scoped as (
    select b.*
    from base b
    where normalized_mode = 'global'
      or b.user_id = auth.uid()
      or exists (
        select 1
        from mutual_friends mf
        where mf.user_id = b.user_id
      )
  ),
  ranked as (
    select
      dense_rank() over (
        order by s.net_worth desc, s.username asc, s.user_id asc
      )::int as rank,
      s.user_id,
      s.username,
      s.liquid_flags,
      s.holdings_value,
      s.net_worth,
      s.holding_count
    from scoped s
  )
  select
    r.rank as result_rank,
    r.user_id as result_user_id,
    r.username as result_username,
    r.liquid_flags as result_liquid_flags,
    r.holdings_value as result_holdings_value,
    r.net_worth as result_net_worth,
    r.holding_count as result_holding_count
  from ranked r
  order by r.rank asc, r.username asc;
end;
$$;

revoke all on function public.get_leaderboard_snapshot_scoped(text) from public;
grant execute on function public.get_leaderboard_snapshot_scoped(text) to authenticated;
