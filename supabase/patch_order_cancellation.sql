-- Patch for existing projects:
-- adds authenticated RPC to hard-delete a user's pending order.

create or replace function public.cancel_pending_order(target_order_id uuid)
returns table (
  result_order_id uuid,
  result_deleted boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_count int;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if target_order_id is null then
    raise exception 'Target order id is required';
  end if;

  delete from public.orders o
  where o.id = target_order_id
    and o.user_id = auth.uid()
    and o.status = 'pending';

  get diagnostics v_deleted_count = row_count;

  return query
  select
    target_order_id as result_order_id,
    (v_deleted_count > 0) as result_deleted;
end;
$$;

revoke all on function public.cancel_pending_order(uuid) from public;
grant execute on function public.cancel_pending_order(uuid) to authenticated;
