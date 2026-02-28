-- Smoke test 03: scoped leaderboard RPC
-- Run in Supabase SQL Editor.

-- 1) Set SQL session auth context to first user.
select set_config(
  'request.jwt.claim.sub',
  (select id::text from public.profiles order by created_at asc limit 1),
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select auth.uid() as acting_user_id;

-- 2) Global snapshot should always return rows.
select count(*) as global_rows
from public.get_leaderboard_snapshot_scoped('global');

-- 3) Friends-only snapshot should return at least self row.
select count(*) as friends_only_rows
from public.get_leaderboard_snapshot_scoped('friends_only');

-- 4) Inspect top rows from each mode.
select *
from public.get_leaderboard_snapshot_scoped('global')
order by result_rank asc, result_username asc
limit 10;

select *
from public.get_leaderboard_snapshot_scoped('friends_only')
order by result_rank asc, result_username asc
limit 10;
