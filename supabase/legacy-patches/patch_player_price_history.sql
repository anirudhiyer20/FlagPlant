-- Patch for existing projects:
-- adds player historical price RPC for charting (7d / 30d / all-time views).

create or replace function public.get_player_price_history(
  target_player_id uuid,
  lookback_days int default null
)
returns table (
  result_snap_date date,
  result_close_price numeric(18,6),
  result_day_change numeric(18,6),
  result_day_change_pct numeric(18,6)
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

  if target_player_id is null then
    raise exception 'Target player id is required';
  end if;

  if not exists (
    select 1
    from public.players p
    where p.id = target_player_id
  ) then
    raise exception 'Target player not found';
  end if;

  if lookback_days is null or lookback_days <= 0 then
    clamped_days := null;
  else
    clamped_days := greatest(1, least(lookback_days, 3650));
  end if;

  v_today := public.app_current_date_est();

  return query
  with historical as (
    select
      dps.snap_date,
      dps.post_price::numeric(18,6) as close_price
    from public.daily_player_snapshots dps
    where dps.player_id = target_player_id
      and dps.snap_date <= v_today
  ),
  current_row as (
    select
      v_today as snap_date,
      p.current_price::numeric(18,6) as close_price
    from public.players p
    where p.id = target_player_id
      and not exists (
        select 1
        from historical h
        where h.snap_date = v_today
      )
  ),
  combined as (
    select h.snap_date, h.close_price
    from historical h
    union all
    select c.snap_date, c.close_price
    from current_row c
  ),
  calc_all as (
    select
      c.snap_date,
      c.close_price,
      lag(c.close_price) over (order by c.snap_date asc) as prev_close
    from combined c
  ),
  filtered as (
    select
      ca.snap_date,
      ca.close_price,
      ca.prev_close
    from calc_all ca
    where clamped_days is null
      or ca.snap_date >= (v_today - (clamped_days - 1))
  )
  select
    f.snap_date as result_snap_date,
    round(f.close_price, 6)::numeric(18,6) as result_close_price,
    round((f.close_price - coalesce(f.prev_close, f.close_price)), 6)::numeric(18,6) as result_day_change,
    case
      when coalesce(f.prev_close, 0::numeric) > 0::numeric then
        round(((f.close_price - f.prev_close) / f.prev_close) * 100::numeric, 6)::numeric(18,6)
      else 0::numeric(18,6)
    end as result_day_change_pct
  from filtered f
  order by f.snap_date asc;
end;
$$;

revoke all on function public.get_player_price_history(uuid, int) from public;
grant execute on function public.get_player_price_history(uuid, int) to authenticated;
