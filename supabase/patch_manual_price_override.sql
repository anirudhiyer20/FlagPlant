-- Adds admin RPC for manual player price overrides.
-- Use only for emergency or operator-driven corrections.

create or replace function public.admin_override_player_price(
  target_player_id uuid,
  override_price numeric(18,6),
  override_reason text default null
)
returns table (
  result_player_id uuid,
  result_player_name text,
  result_previous_price numeric(18,6),
  result_current_price numeric(18,6),
  result_override_reason text,
  result_updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_reason text;
begin
  perform public.assert_admin();

  if target_player_id is null then
    raise exception 'target_player_id is required';
  end if;

  if override_price is null or override_price <= 0 then
    raise exception 'override_price must be > 0';
  end if;

  normalized_reason := nullif(btrim(override_reason), '');

  return query
  with current_row as (
    select p.id, p.name, p.current_price
    from public.players p
    where p.id = target_player_id
  ),
  updated as (
    update public.players p
    set
      current_price = round(override_price, 6),
      updated_at = now()
    from current_row c
    where p.id = c.id
    returning p.id, p.name, c.current_price as previous_price, p.current_price, p.updated_at
  )
  select
    u.id as result_player_id,
    u.name as result_player_name,
    u.previous_price as result_previous_price,
    u.current_price as result_current_price,
    normalized_reason as result_override_reason,
    u.updated_at as result_updated_at
  from updated u;

  if not found then
    raise exception 'Player not found for id %', target_player_id;
  end if;
end;
$$;

revoke all on function public.admin_override_player_price(uuid, numeric, text) from public;
grant execute on function public.admin_override_player_price(uuid, numeric, text) to authenticated;
