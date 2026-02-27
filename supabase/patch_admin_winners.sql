-- Patch for existing projects:
-- adds admin-only winner preview/publish RPC and reward ledger updates.

create or replace function public.assert_admin()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role public.user_role;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select p.role
  into caller_role
  from public.profiles p
  where p.id = auth.uid();

  if caller_role is distinct from 'admin' then
    raise exception 'Admin access required';
  end if;
end;
$$;

create or replace function public.get_daily_winner_preview(target_date date default current_date)
returns table (
  rank int,
  user_id uuid,
  username text,
  opinion_id uuid,
  votes_received int,
  reward_flags numeric(18,6)
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin();

  return query
  with reward_schedule as (
    select *
    from (values
      (1, 50::numeric(18,6)),
      (2, 30::numeric(18,6)),
      (3, 20::numeric(18,6)),
      (4, 10::numeric(18,6)),
      (5, 5::numeric(18,6))
    ) as rs(pos, reward)
  ),
  vote_totals as (
    select
      o.id as opinion_id,
      o.user_id,
      count(v.id)::int as votes_received,
      row_number() over (
        order by count(v.id) desc, o.created_at asc, o.id asc
      )::int as row_pos
    from public.opinions o
    left join public.opinion_votes v
      on v.opinion_id = o.id
      and v.assigned_for_date = target_date
    where o.submitted_for_date = target_date
      and o.status = 'active'
    group by o.id, o.user_id, o.created_at
  ),
  top_five as (
    select vt.*
    from vote_totals vt
    where vt.row_pos <= 5
  ),
  tie_groups as (
    select
      tf.*,
      dense_rank() over (order by tf.votes_received desc)::int as tie_group
    from top_five tf
  ),
  grouped as (
    select
      tg.*,
      min(tg.row_pos) over (partition by tg.tie_group)::int as group_min_pos,
      max(tg.row_pos) over (partition by tg.tie_group)::int as group_max_pos,
      count(*) over (partition by tg.tie_group)::int as group_size
    from tie_groups tg
  ),
  reward_pool as (
    select
      g.*,
      (
        select coalesce(sum(rs.reward), 0::numeric(18,6))
        from reward_schedule rs
        where rs.pos between g.group_min_pos and g.group_max_pos
      ) as group_reward_pool
    from grouped g
  )
  select
    g.row_pos as rank,
    g.user_id,
    p.username,
    g.opinion_id,
    g.votes_received,
    round(g.group_reward_pool / g.group_size::numeric, 6) as reward_flags
  from reward_pool g
  join public.profiles p on p.id = g.user_id
  order by g.row_pos;
end;
$$;

create or replace function public.admin_publish_daily_winners(target_date date default current_date)
returns table (
  rank int,
  user_id uuid,
  username text,
  opinion_id uuid,
  votes_received int,
  reward_flags numeric(18,6)
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin();

  if exists (
    select 1
    from public.daily_winners dw
    where dw.winner_date = target_date
  ) then
    raise exception 'Winners already published for %', target_date;
  end if;

  return query
  with preview as (
    select *
    from public.get_daily_winner_preview(target_date)
  ),
  inserted as (
    insert into public.daily_winners as dw (
      winner_date,
      rank,
      user_id,
      opinion_id,
      votes_received,
      reward_flags
    )
    select
      target_date,
      p.rank,
      p.user_id,
      p.opinion_id,
      p.votes_received,
      p.reward_flags
    from preview p
    returning
      dw.rank,
      dw.user_id,
      dw.opinion_id,
      dw.votes_received,
      dw.reward_flags
  ),
  wallet_updates as (
    update public.wallets w
    set liquid_flags = w.liquid_flags + i.reward_flags
    from inserted i
    where w.user_id = i.user_id
    returning i.user_id, i.opinion_id, i.reward_flags
  ),
  ledger_rows as (
    insert into public.wallet_ledger (user_id, delta_flags, reason, ref_id)
    select
      wu.user_id,
      wu.reward_flags,
      'daily_winner_reward',
      wu.opinion_id
    from wallet_updates wu
    returning id
  )
  select
    i.rank,
    i.user_id,
    p.username,
    i.opinion_id,
    i.votes_received,
    i.reward_flags
  from inserted i
  join public.profiles p on p.id = i.user_id
  order by i.rank;
end;
$$;

revoke all on function public.assert_admin() from public;
grant execute on function public.assert_admin() to authenticated;

revoke all on function public.get_daily_winner_preview(date) from public;
grant execute on function public.get_daily_winner_preview(date) to authenticated;

revoke all on function public.admin_publish_daily_winners(date) from public;
grant execute on function public.admin_publish_daily_winners(date) to authenticated;
