-- Patch for existing projects:
-- adds winner history RPC for viewing previous daily top-5 boards.

create or replace function public.get_recent_winner_boards(limit_days int default 14)
returns table (
  result_winner_date date,
  result_rank int,
  result_user_id uuid,
  result_username text,
  result_opinion_id uuid,
  result_opinion_body text,
  result_votes_received int,
  result_reward_flags numeric(18,6)
)
language plpgsql
security definer
set search_path = public
as $$
declare
  clamped_days int;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  clamped_days := greatest(1, least(coalesce(limit_days, 14), 90));

  return query
  with recent_dates as (
    select distinct dw.winner_date
    from public.daily_winners dw
    order by dw.winner_date desc
    limit clamped_days
  )
  select
    dw.winner_date as result_winner_date,
    dw.rank as result_rank,
    dw.user_id as result_user_id,
    p.username as result_username,
    dw.opinion_id as result_opinion_id,
    o.body as result_opinion_body,
    dw.votes_received as result_votes_received,
    dw.reward_flags as result_reward_flags
  from public.daily_winners dw
  join recent_dates rd on rd.winner_date = dw.winner_date
  join public.profiles p on p.id = dw.user_id
  left join public.opinions o on o.id = dw.opinion_id
  order by dw.winner_date desc, dw.rank asc;
end;
$$;

revoke all on function public.get_recent_winner_boards(int) from public;
grant execute on function public.get_recent_winner_boards(int) to authenticated;
