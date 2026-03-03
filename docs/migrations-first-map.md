# Migrations-First Map (FlagPlant)

This document explains exactly how the project moved from many manual patch files to a migration-first workflow.

## 1) What Changed

1. Added migration baseline:
   - `supabase/migrations/20260303000100_baseline.sql`
2. Archived legacy patch scripts:
   - `supabase/legacy-patches/patch_*.sql`
3. Updated setup guidance in `README.md` to use migrations as the default path.

No app logic was removed in this change. This is a structure/process hardening step.

## 2) Why This Helps

Before:

- You had to remember patch order.
- Different environments could miss a patch.
- Harder to reproduce DB setup exactly.

After:

- One canonical migration baseline for clean setup.
- Future DB changes are append-only migration files.
- Safer, repeatable setup across local/staging/prod.

## 3) Concrete Mapping

The baseline migration already includes the cumulative state that was previously built by:

1. `patch_est_cadence_backfill.sql`
2. `patch_vote_policy.sql`
3. `patch_admin_winners.sql`
4. `patch_order_budget_policy.sql`
5. `patch_order_execution.sql`
6. `patch_order_cancellation.sql`
7. `patch_repricing.sql`
8. `patch_player_market_stats.sql`
9. `patch_player_price_history.sql`
10. `patch_leaderboard.sql`
11. `patch_leaderboard_scope.sql`
12. `patch_public_profiles.sql`
13. `patch_winner_history.sql`
14. `patch_portfolio_history.sql`
15. `patch_portfolio_persistence.sql`
16. `patch_follows.sql`
17. `patch_follow_list_pagination.sql`
18. `patch_daily_close.sql`
19. `patch_manual_price_override.sql`
20. `patch_player_leagues_and_admin_create.sql`
21. `patch_opinion_edit_policy.sql`
22. `patch_admin_diagnostics.sql`
23. `patch_daily_cadence_automation.sql`

## 4) What To Do As A Developer (Simple)

For a brand-new project:

1. Run `supabase/migrations/20260303000100_baseline.sql`.
2. Run `supabase/seed_players.sql`.
3. Run smoke tests in `supabase/smoke_*.sql`.

For an existing working project:

1. Do not re-run archived patch files unless you are repairing a broken environment.
2. Keep the current DB as your baseline-equivalent state.
3. Apply only new migration files created after this baseline.

## 5) What Happens To Legacy Patch Files

Current status:

- Archived under `supabase/legacy-patches/`.

Recommended lifecycle:

1. Keep archived for one release cycle.
2. If staging/prod are stable, optionally delete archive later.

## 6) New Rule Going Forward

Do this:

1. Add new database changes under `supabase/migrations/` only.
2. Use one migration file per logical DB change.

Do not do this:

1. Create new `patch_*.sql` files for normal development.

## 7) Quick Validation Checklist (After Any DB Change)

1. Run smoke SQL scripts:
   - `smoke_01_daily_close_admin.sql`
   - `smoke_02_vote_cadence_integrity.sql`
   - `smoke_03_friends_leaderboard.sql`
   - `smoke_04_daily_cadence_automation.sql`
2. Validate core app flow manually:
   - Opinion submit/edit
   - Vote
   - Buy/sell order
   - Daily close/cadence
   - Leaderboard/winner history
