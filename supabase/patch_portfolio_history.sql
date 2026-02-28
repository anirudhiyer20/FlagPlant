-- Patch for existing projects:
-- adds portfolio value history RPC with close-day FlagPlant breakdown.

create or replace function public.app_current_date_est()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/New_York')::date
$$;

create or replace function public.get_user_portfolio_history(
  target_user_id uuid,
  lookback_days int default 30
)
returns table (
  result_snap_date date,
  result_unplanted_flags_close numeric(18,6),
  result_planted_value_close numeric(18,6),
  result_total_value_close numeric(18,6),
  result_holdings_json jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  clamped_days int;
  v_today date;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  clamped_days := greatest(1, least(coalesce(lookback_days, 30), 120));
  v_today := public.app_current_date_est();

  return query
  with date_window as (
    select generate_series(
      (v_today - (clamped_days - 1))::timestamp,
      v_today::timestamp,
      interval '1 day'
    )::date as snap_date
  ),
  order_deltas as (
    select
      o.trade_date as snap_date,
      o.player_id,
      sum(
        case
          when o.order_type = 'buy' then coalesce(o.units_amount, 0::numeric)
          when o.order_type = 'sell' then -coalesce(o.units_amount, 0::numeric)
          else 0::numeric
        end
      )::numeric(24,10) as delta_units
    from public.orders o
    where o.user_id = target_user_id
      and o.status = 'executed'
      and o.units_amount is not null
    group by o.trade_date, o.player_id
  ),
  player_ids as (
    select distinct od.player_id
    from order_deltas od
  ),
  positions_by_day as (
    select
      dw.snap_date,
      pid.player_id,
      sum(coalesce(od.delta_units, 0::numeric)) over (
        partition by pid.player_id
        order by dw.snap_date
        rows between unbounded preceding and current row
      )::numeric(24,10) as units_close
    from date_window dw
    cross join player_ids pid
    left join order_deltas od
      on od.snap_date = dw.snap_date
      and od.player_id = pid.player_id
  ),
  holdings_details as (
    select
      pbd.snap_date,
      p.name as player_name,
      pbd.units_close,
      (
        pbd.units_close
        * (
          case
            when pbd.snap_date = v_today then p.current_price
            else coalesce(
              (
                select dps.post_price
                from public.daily_player_snapshots dps
                where dps.player_id = pbd.player_id
                  and dps.snap_date <= pbd.snap_date
                order by dps.snap_date desc
                limit 1
              ),
              p.seed_price
            )
          end
        )
      )::numeric(18,6) as market_value
    from positions_by_day pbd
    join public.players p on p.id = pbd.player_id
    where pbd.units_close > 0.005::numeric
  ),
  holdings_agg as (
    select
      hd.snap_date,
      coalesce(sum(hd.market_value), 0::numeric)::numeric(18,6) as planted_value_close,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'player_name', hd.player_name,
            'units', round(hd.units_close, 6),
            'value', round(hd.market_value, 6)
          )
          order by hd.market_value desc, hd.player_name asc
        ),
        '[]'::jsonb
      ) as holdings_json
    from holdings_details hd
    group by hd.snap_date
  ),
  unplanted_by_day as (
    select
      dw.snap_date,
      coalesce(
        (
          select sum(wl.delta_flags)
          from public.wallet_ledger wl
          where wl.user_id = target_user_id
            and (wl.created_at at time zone 'America/New_York')::date <= dw.snap_date
        ),
        0::numeric
      )::numeric(18,6) as unplanted_flags_close
    from date_window dw
  )
  select
    dw.snap_date as result_snap_date,
    ubd.unplanted_flags_close as result_unplanted_flags_close,
    coalesce(ha.planted_value_close, 0::numeric)::numeric(18,6) as result_planted_value_close,
    (ubd.unplanted_flags_close + coalesce(ha.planted_value_close, 0::numeric))::numeric(18,6) as result_total_value_close,
    coalesce(ha.holdings_json, '[]'::jsonb) as result_holdings_json
  from date_window dw
  join unplanted_by_day ubd on ubd.snap_date = dw.snap_date
  left join holdings_agg ha on ha.snap_date = dw.snap_date
  order by dw.snap_date asc;
end;
$$;

revoke all on function public.get_user_portfolio_history(uuid, int) from public;
grant execute on function public.get_user_portfolio_history(uuid, int) to authenticated;
