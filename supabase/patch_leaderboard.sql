-- Patch for existing projects:
-- adds leaderboard snapshot RPC (ranked by net worth).

create or replace function public.get_leaderboard_snapshot()
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
begin
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
  ranked as (
    select
      dense_rank() over (
        order by b.net_worth desc, b.username asc, b.user_id asc
      )::int as rank,
      b.user_id,
      b.username,
      b.liquid_flags,
      b.holdings_value,
      b.net_worth,
      b.holding_count
    from base b
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

revoke all on function public.get_leaderboard_snapshot() from public;
grant execute on function public.get_leaderboard_snapshot() to authenticated;
