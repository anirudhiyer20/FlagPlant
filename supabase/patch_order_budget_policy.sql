-- Patch for existing projects:
-- enforces pending buy/sell budgets on order insert.

drop policy if exists orders_insert_own on public.orders;
create policy orders_insert_own
on public.orders
for insert
with check (
  auth.uid() = user_id
  and (
    (
      order_type = 'buy'
      and flags_amount is not null
      and flags_amount <= (
        coalesce(
          (
            select w.liquid_flags
            from public.wallets w
            where w.user_id = auth.uid()
          ),
          0::numeric
        )
        - coalesce(
          (
            select sum(o.flags_amount)
            from public.orders o
            where o.user_id = auth.uid()
              and o.order_type = 'buy'
              and o.status = 'pending'
          ),
          0::numeric
        )
      )
    )
    or
    (
      order_type = 'sell'
      and units_amount is not null
      and units_amount <= (
        coalesce(
          (
            select h.units
            from public.holdings h
            where h.user_id = auth.uid()
              and h.player_id = orders.player_id
          ),
          0::numeric
        )
        - coalesce(
          (
            select sum(o.units_amount)
            from public.orders o
            where o.user_id = auth.uid()
              and o.player_id = orders.player_id
              and o.order_type = 'sell'
              and o.status = 'pending'
          ),
          0::numeric
        )
      )
    )
  )
);
