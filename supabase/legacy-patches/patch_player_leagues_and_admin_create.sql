-- Patch for existing projects:
-- adds player league support + admin RPC to add new players to market.

alter table public.players
  add column if not exists league text;

update public.players
set league = 'NBA'
where league is null or btrim(league) = '';

alter table public.players
  alter column league set default 'NBA';

alter table public.players
  alter column league set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'players_league_nonempty_chk'
      and conrelid = 'public.players'::regclass
  ) then
    alter table public.players
      add constraint players_league_nonempty_chk
      check (char_length(btrim(league)) between 2 and 32);
  end if;
end;
$$;

create index if not exists idx_players_league_active_name
  on public.players (league, active, name);

create or replace function public.admin_create_player(
  target_name text,
  target_league text,
  initial_price numeric(18,6),
  target_active boolean default true
)
returns table (
  result_player_id uuid,
  result_player_name text,
  result_league text,
  result_seed_price numeric(18,6),
  result_current_price numeric(18,6),
  result_active boolean,
  result_created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_name text;
  normalized_league text;
begin
  perform public.assert_admin();

  normalized_name := nullif(btrim(target_name), '');
  normalized_league := upper(nullif(btrim(target_league), ''));

  if normalized_name is null then
    raise exception 'target_name is required';
  end if;

  if normalized_league is null then
    raise exception 'target_league is required';
  end if;

  if char_length(normalized_league) < 2 or char_length(normalized_league) > 32 then
    raise exception 'target_league must be between 2 and 32 characters';
  end if;

  if normalized_league <> all (array['NFL', 'NHL', 'MLB', 'WNBA']) then
    raise exception 'target_league must be one of NFL, NHL, MLB, WNBA';
  end if;

  if initial_price is null or initial_price <= 0 then
    raise exception 'initial_price must be > 0';
  end if;

  return query
  insert into public.players (
    name,
    league,
    active,
    seed_price,
    current_price
  )
  values (
    normalized_name,
    normalized_league,
    coalesce(target_active, true),
    round(initial_price, 6),
    round(initial_price, 6)
  )
  returning
    id as result_player_id,
    name as result_player_name,
    league as result_league,
    seed_price as result_seed_price,
    current_price as result_current_price,
    active as result_active,
    created_at as result_created_at;
end;
$$;

revoke all on function public.admin_create_player(text, text, numeric, boolean) from public;
grant execute on function public.admin_create_player(text, text, numeric, boolean) to authenticated;
