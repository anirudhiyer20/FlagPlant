-- Patch for existing projects:
-- blocks buy inserts when total pending buy flags would exceed wallet balance.

drop policy if exists orders_insert_own on public.orders;
create policy orders_insert_own
on public.orders
for insert
with check (
  auth.uid() = user_id
  and (
    order_type = 'sell'
    or (
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
  )
);
