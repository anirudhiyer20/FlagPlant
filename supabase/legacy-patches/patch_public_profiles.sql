-- Patch for existing projects:
-- adds limited public profile RPCs for leaderboard profile views.

create or replace function public.get_public_profile_snapshot(target_user_id uuid)
returns table (
  result_user_id uuid,
  result_username text,
  result_liquid_flags numeric(18,6),
  result_holdings_value numeric(18,6),
  result_holdings_cost_basis numeric(18,6),
  result_unrealized_pnl numeric(18,6),
  result_unrealized_return_pct numeric(18,6),
  result_net_worth numeric(18,6),
  result_liquid_share_pct numeric(18,6),
  result_invested_share_pct numeric(18,6),
  result_holding_count int,
  result_top_holding_player_name text,
  result_top_holding_value numeric(18,6),
  result_latest_winner_date date,
  result_latest_winner_rank int,
  result_latest_winner_votes int,
  result_latest_winner_reward_flags numeric(18,6),
  result_latest_winner_opinion text
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
  with holdings_rows as (
    select
      h.player_id,
      p.name as player_name,
      h.units,
      h.avg_cost_basis,
      p.current_price,
      (h.units * h.avg_cost_basis)::numeric(18,6) as cost_basis_value,
      (h.units * p.current_price)::numeric(18,6) as market_value
    from public.holdings h
    join public.players p on p.id = h.player_id
    where h.user_id = target_user_id
      and h.units > 0.005::numeric
  ),
  holdings_agg as (
    select
      count(*)::int as holding_count,
      coalesce(sum(hr.cost_basis_value), 0::numeric)::numeric(18,6) as holdings_cost_basis,
      coalesce(sum(hr.market_value), 0::numeric)::numeric(18,6) as holdings_value
    from holdings_rows hr
  ),
  top_holding as (
    select
      hr.player_name,
      hr.market_value
    from holdings_rows hr
    order by hr.market_value desc, hr.player_name asc
    limit 1
  ),
  latest_winner as (
    select
      dw.winner_date,
      dw.rank,
      dw.votes_received,
      dw.reward_flags,
      o.body as opinion_body
    from public.daily_winners dw
    left join public.opinions o on o.id = dw.opinion_id
    where dw.user_id = target_user_id
    order by dw.winner_date desc, dw.rank asc
    limit 1
  )
  select
    pr.id as result_user_id,
    pr.username as result_username,
    coalesce(w.liquid_flags, 0::numeric)::numeric(18,6) as result_liquid_flags,
    ha.holdings_value as result_holdings_value,
    ha.holdings_cost_basis as result_holdings_cost_basis,
    (ha.holdings_value - ha.holdings_cost_basis)::numeric(18,6) as result_unrealized_pnl,
    case
      when ha.holdings_cost_basis > 0
      then round(((ha.holdings_value - ha.holdings_cost_basis) / ha.holdings_cost_basis) * 100::numeric, 6)
      else null::numeric(18,6)
    end as result_unrealized_return_pct,
    (coalesce(w.liquid_flags, 0::numeric) + ha.holdings_value)::numeric(18,6) as result_net_worth,
    case
      when (coalesce(w.liquid_flags, 0::numeric) + ha.holdings_value) > 0
      then round((coalesce(w.liquid_flags, 0::numeric) / (coalesce(w.liquid_flags, 0::numeric) + ha.holdings_value)) * 100::numeric, 6)
      else null::numeric(18,6)
    end as result_liquid_share_pct,
    case
      when (coalesce(w.liquid_flags, 0::numeric) + ha.holdings_value) > 0
      then round((ha.holdings_value / (coalesce(w.liquid_flags, 0::numeric) + ha.holdings_value)) * 100::numeric, 6)
      else null::numeric(18,6)
    end as result_invested_share_pct,
    ha.holding_count as result_holding_count,
    th.player_name as result_top_holding_player_name,
    th.market_value as result_top_holding_value,
    lw.winner_date as result_latest_winner_date,
    lw.rank as result_latest_winner_rank,
    lw.votes_received as result_latest_winner_votes,
    lw.reward_flags as result_latest_winner_reward_flags,
    lw.opinion_body as result_latest_winner_opinion
  from public.profiles pr
  left join public.wallets w on w.user_id = pr.id
  cross join holdings_agg ha
  left join top_holding th on true
  left join latest_winner lw on true
  where pr.id = target_user_id;
end;
$$;

create or replace function public.get_public_profile_holdings(target_user_id uuid)
returns table (
  result_player_id uuid,
  result_player_name text,
  result_units numeric(24,10),
  result_avg_cost_basis numeric(18,6),
  result_current_price numeric(18,6),
  result_cost_basis_value numeric(18,6),
  result_market_value numeric(18,6),
  result_unrealized_pnl numeric(18,6)
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
    h.player_id as result_player_id,
    p.name as result_player_name,
    h.units as result_units,
    h.avg_cost_basis as result_avg_cost_basis,
    p.current_price as result_current_price,
    (h.units * h.avg_cost_basis)::numeric(18,6) as result_cost_basis_value,
    (h.units * p.current_price)::numeric(18,6) as result_market_value,
    (h.units * (p.current_price - h.avg_cost_basis))::numeric(18,6) as result_unrealized_pnl
  from public.holdings h
  join public.players p on p.id = h.player_id
  where h.user_id = target_user_id
    and h.units > 0.005::numeric
  order by result_market_value desc, result_player_name asc;
end;
$$;

revoke all on function public.get_public_profile_snapshot(uuid) from public;
grant execute on function public.get_public_profile_snapshot(uuid) to authenticated;

revoke all on function public.get_public_profile_holdings(uuid) from public;
grant execute on function public.get_public_profile_holdings(uuid) to authenticated;
