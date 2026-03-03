-- Patch for existing projects:
-- adds player-level market stats (holders + invested capital) for UI cards.

create or replace function public.get_player_market_stats()
returns table (
  result_player_id uuid,
  result_holder_count int,
  result_invested_capital numeric(18,6)
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    p.id as result_player_id,
    count(h.user_id)::int as result_holder_count,
    coalesce(sum(h.units * p.current_price), 0::numeric)::numeric(18,6) as result_invested_capital
  from public.players p
  left join public.holdings h
    on h.player_id = p.id
    and h.units > 0.005::numeric
  group by p.id
  order by p.id;
end;
$$;

revoke all on function public.get_player_market_stats() from public;
grant execute on function public.get_player_market_stats() to authenticated;
