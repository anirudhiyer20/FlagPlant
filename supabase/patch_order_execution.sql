-- Patch for existing projects:
-- adds admin RPCs for pending buy-order preview and execution.

create or replace function public.admin_preview_pending_buy_orders(target_date date default current_date)
returns table (
  result_user_id uuid,
  result_username text,
  result_pending_order_count int,
  result_pending_flags_total numeric(18,6)
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin();

  return query
  select
    o.user_id,
    p.username,
    count(*)::int as pending_order_count,
    coalesce(sum(o.flags_amount), 0::numeric(18,6)) as pending_flags_total
  from public.orders o
  join public.profiles p on p.id = o.user_id
  where o.trade_date = target_date
    and o.order_type = 'buy'
    and o.status = 'pending'
  group by o.user_id, p.username
  order by pending_flags_total desc, pending_order_count desc;
end;
$$;

create or replace function public.admin_execute_pending_buy_orders(target_date date default current_date)
returns table (
  result_order_id uuid,
  result_user_id uuid,
  result_player_id uuid,
  result_status public.order_status,
  result_flags_amount numeric(18,6),
  result_units_amount numeric(24,10),
  result_note text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_wallet numeric(18,6);
  v_price numeric(18,6);
  v_active boolean;
  v_units numeric(24,10);
  v_updated_rows int;
begin
  perform public.assert_admin();

  for rec in
    select
      o.id,
      o.user_id,
      o.player_id,
      o.flags_amount
    from public.orders o
    where o.trade_date = target_date
      and o.order_type = 'buy'
      and o.status = 'pending'
    order by o.created_at asc, o.id asc
  loop
    select w.liquid_flags
    into v_wallet
    from public.wallets w
    where w.user_id = rec.user_id
    for update;

    select p.current_price, p.active
    into v_price, v_active
    from public.players p
    where p.id = rec.player_id;

    if v_wallet is null then
      update public.orders o
      set status = 'failed', executed_at = now()
      where o.id = rec.id and o.status = 'pending';

      return query
      select
        rec.id,
        rec.user_id,
        rec.player_id,
        'failed'::public.order_status,
        rec.flags_amount,
        null::numeric(24,10),
        'wallet_missing'::text;

      continue;
    end if;

    if v_price is null or coalesce(v_active, false) = false then
      update public.orders o
      set status = 'failed', executed_at = now()
      where o.id = rec.id and o.status = 'pending';

      return query
      select
        rec.id,
        rec.user_id,
        rec.player_id,
        'failed'::public.order_status,
        rec.flags_amount,
        null::numeric(24,10),
        'player_unavailable'::text;

      continue;
    end if;

    if rec.flags_amount is null or rec.flags_amount <= 0 then
      update public.orders o
      set status = 'failed', executed_at = now()
      where o.id = rec.id and o.status = 'pending';

      return query
      select
        rec.id,
        rec.user_id,
        rec.player_id,
        'failed'::public.order_status,
        rec.flags_amount,
        null::numeric(24,10),
        'invalid_flags_amount'::text;

      continue;
    end if;

    if rec.flags_amount > v_wallet then
      update public.orders o
      set status = 'failed', executed_at = now()
      where o.id = rec.id and o.status = 'pending';

      return query
      select
        rec.id,
        rec.user_id,
        rec.player_id,
        'failed'::public.order_status,
        rec.flags_amount,
        null::numeric(24,10),
        'insufficient_wallet_at_execution'::text;

      continue;
    end if;

    v_units := (rec.flags_amount / v_price)::numeric(24,10);

    update public.wallets w
    set liquid_flags = w.liquid_flags - rec.flags_amount,
        updated_at = now()
    where w.user_id = rec.user_id;

    insert into public.holdings as h (
      user_id,
      player_id,
      units,
      avg_cost_basis,
      updated_at
    )
    values (
      rec.user_id,
      rec.player_id,
      v_units,
      v_price,
      now()
    )
    on conflict (user_id, player_id) do update set
      units = h.units + excluded.units,
      avg_cost_basis =
        case
          when (h.units + excluded.units) = 0 then 0
          else (
            (h.units * h.avg_cost_basis)
            + (excluded.units * excluded.avg_cost_basis)
          ) / (h.units + excluded.units)
        end,
      updated_at = now();

    update public.orders o
    set
      status = 'executed',
      units_amount = v_units,
      executed_at = now()
    where o.id = rec.id and o.status = 'pending';

    get diagnostics v_updated_rows = row_count;
    if v_updated_rows = 0 then
      return query
      select
        rec.id,
        rec.user_id,
        rec.player_id,
        'failed'::public.order_status,
        rec.flags_amount,
        null::numeric(24,10),
        'order_no_longer_pending'::text;

      continue;
    end if;

    insert into public.wallet_ledger (user_id, delta_flags, reason, ref_id)
    values (
      rec.user_id,
      -rec.flags_amount,
      'buy_order_execute',
      rec.id
    );

    return query
    select
      rec.id,
      rec.user_id,
      rec.player_id,
      'executed'::public.order_status,
      rec.flags_amount,
      v_units,
      'executed'::text;
  end loop;
end;
$$;

revoke all on function public.admin_preview_pending_buy_orders(date) from public;
grant execute on function public.admin_preview_pending_buy_orders(date) to authenticated;

revoke all on function public.admin_execute_pending_buy_orders(date) from public;
grant execute on function public.admin_execute_pending_buy_orders(date) to authenticated;
