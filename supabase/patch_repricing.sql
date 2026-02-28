-- Patch for existing projects:
-- adds admin RPCs for player repricing based on executed order flow.

create or replace function public.app_current_date_est()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/New_York')::date
$$;

create or replace function public.admin_preview_player_repricing(target_date date default public.app_current_date_est())
returns table (
  result_player_id uuid,
  result_player_name text,
  result_pre_price numeric(18,6),
  result_post_price numeric(18,6),
  result_net_flow_flags numeric(18,6),
  result_total_units numeric(24,10),
  result_effective_capital numeric(18,6),
  result_price_multiplier numeric(18,6)
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin();

  return query
  with flows as (
    select
      p.id as player_id,
      p.name as player_name,
      p.current_price as pre_price,
      p.baseline_capital,
      coalesce(
        sum(
          case
            when o.order_type = 'buy' then o.flags_amount
            else 0::numeric(18,6)
          end
        ),
        0::numeric(18,6)
      ) as buy_flow_flags,
      coalesce(
        sum(
          case
            when o.order_type = 'sell' then coalesce(
              o.flags_amount,
              coalesce(o.units_amount, 0::numeric) * p.current_price
            )
            else 0::numeric
          end
        ),
        0::numeric
      )::numeric(18,6) as sell_flow_flags
    from public.players p
    left join public.orders o
      on o.player_id = p.id
      and o.trade_date = target_date
      and o.status = 'executed'
    group by p.id, p.name, p.current_price, p.baseline_capital
  ),
  calc_base as (
    select
      f.*,
      (f.buy_flow_flags - f.sell_flow_flags)::numeric(18,6) as net_flow_flags
    from flows f
  ),
  market_stats as (
    select
      coalesce(sum(abs(cb.net_flow_flags)), 0::numeric(18,6)) as total_abs_market_flow
    from calc_base cb
  ),
  calc as (
    select
      cb.*,
      ms.total_abs_market_flow,
      case
        when ms.total_abs_market_flow = 0 then 0::numeric(18,6)
        else (cb.net_flow_flags / ms.total_abs_market_flow)::numeric(18,6)
      end as market_flow_share,
      least(
        greatest(
          (
            case
              when ms.total_abs_market_flow = 0 then 0::numeric
              else cb.net_flow_flags / ms.total_abs_market_flow
            end
          ) * 0.05::numeric,
          -0.03::numeric
        ),
        0.03::numeric
      )::numeric(18,6) as bounded_flow_ratio
    from calc_base cb
    cross join market_stats ms
  ),
  units as (
    select
      h.player_id,
      coalesce(sum(h.units), 0::numeric)::numeric(24,10) as total_units
    from public.holdings h
    group by h.player_id
  )
  select
    c.player_id as result_player_id,
    c.player_name as result_player_name,
    c.pre_price as result_pre_price,
    round(
      greatest(0.01::numeric, c.pre_price * (1::numeric + c.bounded_flow_ratio)),
      6
    )::numeric(18,6) as result_post_price,
    c.net_flow_flags as result_net_flow_flags,
    coalesce(u.total_units, 0::numeric(24,10)) as result_total_units,
    (c.baseline_capital + c.net_flow_flags)::numeric(18,6) as result_effective_capital,
    round((1::numeric + c.bounded_flow_ratio), 6)::numeric(18,6) as result_price_multiplier
  from calc c
  left join units u on u.player_id = c.player_id
  order by c.pre_price desc, c.player_name asc;
end;
$$;

create or replace function public.admin_apply_player_repricing(target_date date default public.app_current_date_est())
returns table (
  result_player_id uuid,
  result_player_name text,
  result_pre_price numeric(18,6),
  result_post_price numeric(18,6),
  result_net_flow_flags numeric(18,6),
  result_total_units numeric(24,10),
  result_effective_capital numeric(18,6),
  result_price_multiplier numeric(18,6)
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin();

  return query
  with preview as (
    select *
    from public.admin_preview_player_repricing(target_date)
  ),
  upsert_snapshots as (
    insert into public.daily_player_snapshots (
      snap_date,
      player_id,
      pre_price,
      post_price,
      net_flow_flags,
      total_units,
      effective_capital,
      created_at
    )
    select
      target_date,
      p.result_player_id,
      p.result_pre_price,
      p.result_post_price,
      p.result_net_flow_flags,
      p.result_total_units,
      p.result_effective_capital,
      now()
    from preview p
    on conflict (snap_date, player_id) do update set
      pre_price = excluded.pre_price,
      post_price = excluded.post_price,
      net_flow_flags = excluded.net_flow_flags,
      total_units = excluded.total_units,
      effective_capital = excluded.effective_capital,
      created_at = now()
    returning player_id
  ),
  update_prices as (
    update public.players pl
    set
      current_price = p.result_post_price,
      updated_at = now()
    from preview p
    where pl.id = p.result_player_id
    returning pl.id
  )
  select
    p.result_player_id,
    p.result_player_name,
    p.result_pre_price,
    p.result_post_price,
    p.result_net_flow_flags,
    p.result_total_units,
    p.result_effective_capital,
    p.result_price_multiplier
  from preview p
  order by p.result_pre_price desc, p.result_player_name asc;
end;
$$;

revoke all on function public.admin_preview_player_repricing(date) from public;
grant execute on function public.admin_preview_player_repricing(date) to authenticated;

revoke all on function public.admin_apply_player_repricing(date) from public;
grant execute on function public.admin_apply_player_repricing(date) to authenticated;
