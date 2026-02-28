# FlagPlant MVP (Phase 1: Backend Foundation)

This repository now contains the **first implementation phase** for FlagPlant:

- PostgreSQL schema for Supabase
- Seed data for the 50 NBA players
- Step-by-step setup instructions for beginners

If you are new to development, follow this guide in order and do not skip steps.

## 1) Create required accounts

### A) Supabase account
1. Go to https://supabase.com and create an account.
2. Click **New project**.
3. Name it `flagplant-mvp`.
4. Set a strong database password and save it in a password manager.
5. Choose a nearby region.
6. Wait for project provisioning.

### B) Vercel account (for later frontend deploy)
1. Go to https://vercel.com and sign up.
2. Connect your Git provider (GitHub recommended).
3. No deployment needed yet for Phase 1.

## 2) Configure Supabase project

In Supabase dashboard for your new project:

1. Open **Project Settings -> API**.
2. Save these values in a secure local note:
   - `Project URL`
   - `anon public key`
   - `service_role key` (never expose in frontend)
3. Open **SQL Editor**.

## 3) Run database schema

1. Open `supabase/schema.sql` from this repo.
2. Copy all SQL.
3. Paste into Supabase SQL Editor and run.
4. Confirm tables were created in **Table Editor**.

## 4) Seed initial player list

1. Open `supabase/seed_players.sql`.
2. Run it in SQL Editor.
3. Confirm 50 players appear in `public.players`.

## 5) Create first admin user

1. In Supabase dashboard, go to **Authentication -> Users**.
2. Create a user manually (your own email).
3. In SQL Editor, run:

```sql
update public.profiles
set role = 'admin'
where email = 'YOUR_EMAIL_HERE';
```

## 6) Validate the setup

Run these checks in SQL Editor:

```sql
select count(*) as player_count from public.players;
select min(seed_price) as min_price, max(seed_price) as max_price from public.players;
select role, count(*) from public.profiles group by role;
```

Expected:
- `player_count = 50`
- `min_price = 62`, `max_price = 500`
- at least one `admin`

## 7) What is implemented in this phase

- Core relational schema for:
  - profiles and wallets
  - opinions, assignments, votes
  - daily winners
  - players, holdings, orders
  - ledger and job runs
- Trigger to auto-create profile + wallet after auth signup
- Basic safety constraints (vote limits, holding cap scaffolding)
- Seeded 50-player pricing ladder

## 8) Next phase

Next we will implement:

1. Next.js app scaffold
2. Signup/login pages
3. Daily opinion submission UI
4. Admin dashboard (price override, job trigger, diagnostics)

## 9) Phase 2 local app (now added)

A starter Next.js app now exists in `web/` with:

- Home page (`/`)
- Auth page (`/auth`) for signup/login
- User dashboard (`/dashboard`) for wallet/opinion/vote status
- Daily opinion page (`/opinion`) with one submission per user/day
- Vote page (`/vote`) for assigned-opinion voting
- Admin page (`/admin`) for winner preview/publish (admin users only)
- Players page (`/players`) reading from Supabase `public.players`
- Player detail page (`/players/[id]`) with buy/sell order forms
- Orders page (`/orders`) for personal order history
- Leaderboard page (`/leaderboard`) for ranked net worth snapshots
- Public profile page (`/profiles/[id]`) with limited portfolio + winner visibility
- Winner history page (`/winners`) for previous daily top-5 boards

If you already set up Supabase before this update, run
`supabase/patch_est_cadence_backfill.sql` once in Supabase SQL Editor to
normalize existing opinion/vote date fields to ET cadence.
Then run `supabase/patch_vote_policy.sql` once in Supabase SQL Editor to apply
the latest ET/day-cadence RLS policy changes for voting reads/inserts.
Also run `supabase/patch_admin_winners.sql` once to add admin winner RPC tools.
Also run `supabase/patch_order_budget_policy.sql` once to enforce combined
pending buy-order budget limits against wallet balance.
Also run `supabase/patch_order_execution.sql` once to add admin order-clearing
RPC tools (pending buy/sell execution into holdings/wallet/ledger).
Also run `supabase/patch_order_cancellation.sql` once to add authenticated pending-order cancellation RPC.
Also run `supabase/patch_repricing.sql` once to add admin repricing preview/apply
RPC tools (price updates based on executed order flow).
Also run `supabase/patch_player_market_stats.sql` once to add player card market
stats RPC (`holders` and `invested capital`).
Also run `supabase/patch_player_price_history.sql` once to add player historical
price RPC for charting (`7d`, `30d`, `all-time`).
Also run `supabase/patch_leaderboard.sql` once to add leaderboard snapshot RPC.
Also run `supabase/patch_leaderboard_scope.sql` once to add server-side friends-only leaderboard filtering RPC.
Also run `supabase/patch_public_profiles.sql` once to add public profile view RPCs.
Also run `supabase/patch_winner_history.sql` once to add winner-history RPC.
Also run `supabase/patch_portfolio_history.sql` once to add portfolio history RPC for charting.
Also run `supabase/patch_portfolio_persistence.sql` once to add persistent end-of-day portfolio snapshots and snapshot-backed history reads.
Also run `supabase/patch_follows.sql` once to add follow/unfollow social graph RPCs.
Also run `supabase/patch_daily_close.sql` once to add one-click admin daily-close pipeline RPC.

### Existing Project Patch Order (Recommended)

Run in Supabase SQL Editor in this order:

1. `supabase/patch_est_cadence_backfill.sql`
2. `supabase/patch_vote_policy.sql`
3. `supabase/patch_admin_winners.sql`
4. `supabase/patch_order_budget_policy.sql`
5. `supabase/patch_order_execution.sql`
6. `supabase/patch_order_cancellation.sql`
7. `supabase/patch_repricing.sql`
8. `supabase/patch_player_market_stats.sql`
9. `supabase/patch_player_price_history.sql`
10. `supabase/patch_leaderboard.sql`
11. `supabase/patch_leaderboard_scope.sql`
12. `supabase/patch_public_profiles.sql`
13. `supabase/patch_winner_history.sql`
14. `supabase/patch_portfolio_history.sql`
15. `supabase/patch_portfolio_persistence.sql`
16. `supabase/patch_follows.sql`
17. `supabase/patch_daily_close.sql`

### SQL Smoke Tests

- `supabase/smoke_01_daily_close_admin.sql`: validates admin context + daily close.
- `supabase/smoke_02_vote_cadence_integrity.sql`: validates ET D->D+1 opinion/vote cadence.
- `supabase/smoke_03_friends_leaderboard.sql`: validates global vs friends-only leaderboard scope.

### Time Standard (ET)

- App business dates are always Eastern Time via `public.app_current_date_est()`.
- Cadence is fixed:
  - Submit opinions on day D (ET)
  - Vote on day D+1 (ET) for day D opinions
  - Winners for vote date D+1 are computed from opinions submitted on D
- `created_at`/`executed_at` are `timestamptz` and stored in UTC by Postgres (expected).
  Convert to ET when displaying in UI or when deriving a business date.


### A) Install dependencies

From project root:

```bash
cd web
npm install
```

### B) Add env file

In `web/`, create `.env.local` from the template:

```bash
copy .env.local.example .env.local
```

Then edit `.env.local` and set:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Do not put `service_role` key in browser/client code.

### C) Start the app

```bash
npm run dev
```

Open http://localhost:3000

### D) Smoke test

1. Open `/auth` and sign up a brand-new user.
2. In Supabase Table Editor, confirm:
   - one row in `public.profiles`
   - one row in `public.wallets`
   - `wallets.liquid_flags = 100`
3. Open `/dashboard` and confirm wallet/opinion/vote sections load for logged-in user.
4. Open `/opinion` with at least two users and submit one opinion each.
5. Run `supabase/dev_seed_vote_assignments.sql` in Supabase SQL Editor.
6. Open `/vote` for one of those users and cast a vote.
7. Confirm one row appears in `public.opinion_votes`.
8. Try voting the same opinion again and confirm it is blocked.
9. Open `/admin` as your admin account, preview winners, then publish winners.
10. Confirm rows appear in `public.daily_winners` and reward entries in `public.wallet_ledger`.
11. Refresh `/dashboard` and confirm latest winner result appears for rewarded users.
12. Open `/players`, click a player, and create a buy order.
13. Open `/orders` and confirm your new order appears with `pending` status.
14. Open `/admin`, choose date, preview pending buy/sell orders, then execute pending orders.
15. Open `/orders` and confirm status changes to `executed` (or `failed` if invalid at execution).
16. In `/admin`, preview repricing then apply repricing for the same date.
17. Refresh `/players` and confirm player prices updated.
18. Refresh `/dashboard` and confirm holdings + wallet values update after execution.
19. Open `/leaderboard` and confirm users are ranked by total net worth.
20. Click a leaderboard username and confirm `/profiles/[id]` shows only wallet, portfolio metrics, holdings, and latest winner + opinion.
21. Open `/winners` and confirm prior top-5 boards show rank, name, opinion, and votes.
22. Open another user profile and verify follow/unfollow updates follower/following counts and connection lists.
23. On `/leaderboard`, toggle **Friends only** and confirm it shows only mutual follows (plus you).
24. On `/admin`, run **Run Daily Close (All Steps)** and confirm step results are returned.
25. In Supabase Table Editor, confirm `daily_user_portfolio_snapshots` and `daily_user_holding_snapshots` are populated for the close date.

---

## Notes for beta safety messaging

On signup UI (next phase), include this visible line:

> "Beta notice: Please use a funny fake password while we test security/privacy features."

(Passwords will still be securely hashed by Supabase Auth.)
