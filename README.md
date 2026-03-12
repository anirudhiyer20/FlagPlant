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

## 3) Run database schema (migration baseline)

1. Open `supabase/migrations/20260303000100_baseline.sql` from this repo.
2. Copy all SQL.
3. Paste into Supabase SQL Editor and run.
4. Confirm tables were created in **Table Editor**.

`supabase/schema.sql` is kept as a schema snapshot for reference.

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

### Migration-First Workflow (New Standard)

- Database changes now live in `supabase/migrations/`.
- For a new project, run the latest baseline migration SQL first, then seed data.
- For future database changes, create a new migration file instead of creating a new `patch_*.sql`.
- Legacy patch scripts are archived in `supabase/legacy-patches/` for historical reference only.
- Detailed migration map and rollout checklist: `docs/migrations-first-map.md`.

#### Guard Rails (Step 2)

Use the policy check before committing DB changes:

```bash
node scripts/check-supabase-sql-policy.mjs --staged
```

Optional: enforce this automatically on each commit:

```bash
git config core.hooksPath .githooks
```

Then the pre-commit hook runs the same check and blocks:

- new `supabase/patch_*.sql` files
- edits to archived legacy patch files
- new `supabase/*.sql` files outside migrations/smoke/seed paths

### Step 3: CLI/CI Migratability Check

CI now includes `.github/workflows/supabase-migrations.yml`, which:

1. runs the SQL policy guard
2. starts a local Supabase stack
3. runs `supabase db reset --local` (applies migrations + seed from scratch)
4. verifies key functions and player seed rows exist
5. runs SQL smoke suites (`smoke_01` through `smoke_04`)

This workflow runs on every pull request and on every push to `main`.

Run this locally (optional, before pushing):

```bash
supabase start
supabase db reset --local
supabase stop --no-backup
```

Notes:

- Requires Docker and Supabase CLI installed.
- This check validates migratability on a fresh local database instance.
- Seed integrity guard validates that seeded players are non-empty, valid, and name-unique.
  You can add/remove players without updating CI constants.

### Step 1: Automated Testing Foundation

Web smoke tests are implemented with Playwright under:

- `web/tests/e2e/public-smoke.spec.ts`

Run locally:

```bash
cd web
npm run test:e2e:install
npm run test:e2e:list
npm run test:e2e
```

CI workflow:

- `.github/workflows/web-smoke.yml`

Current smoke scope:

1. Home page renders hero content.
2. Auth page renders sign-in form.
3. Protected pages show signed-out guidance.

Optional authenticated smoke:

- `npm run test:e2e:auth`
- requires env vars:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `E2E_TEST_EMAIL`
  - `E2E_TEST_PASSWORD`

GitHub Actions runs authenticated smoke only when corresponding repository secrets are set.

To enable authenticated smoke in CI:

1. Create a dedicated test user in your Supabase Auth project (do not use your personal admin account).
2. Ensure the test user can sign in with password auth.
3. In GitHub repo settings, open **Settings -> Secrets and variables -> Actions**.
4. Add secrets:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `E2E_TEST_EMAIL`
   - `E2E_TEST_PASSWORD`
5. Push any commit and confirm `Web Smoke Tests` runs authenticated smoke.

### Existing Project Upgrade Note

If your current database is already working and has all prior patch changes applied,
you do not need to replay archived patch files.

Going forward:

1. Treat your current production schema as already at baseline.
2. Apply only new migration files created after `20260303000100_baseline.sql`.
3. Keep using the smoke tests below after each DB change.

### SQL Smoke Tests

- `supabase/smoke_01_daily_close_admin.sql`: validates admin context + daily close.
- `supabase/smoke_02_vote_cadence_integrity.sql`: validates ET D->D+1 opinion/vote cadence.
- `supabase/smoke_03_friends_leaderboard.sql`: validates global vs friends-only leaderboard scope.
- `supabase/smoke_04_daily_cadence_automation.sql`: validates cron job + cadence automation function wiring.

These smoke suites now run automatically in CI during `Supabase Migrations`.
You can still run them manually in Supabase SQL Editor for ad-hoc diagnostics.

### Time Standard (ET)

- App business dates are always Eastern Time via `public.app_current_date_est()`.
- Cadence is fixed:
  - Submit opinions on day D (ET)
  - Vote on day D+1 (ET) for day D opinions
  - Winners for vote date D+1 are computed from opinions submitted on D
- Automated daily cadence runs at midnight ET (with a 00:00-00:04 ET guarded window):
  - close and publish for day D
  - execute day-D pending buy/sell orders and repricing
  - generate day-(D+1) vote assignments from day-D opinions
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
26. On `/admin`, in **Manual Price Override**, set a small test price change for one player and confirm `/flag-market` and `/players/[id]` reflect the new current price after refresh.

---

## Notes for beta safety messaging

On signup UI (next phase), include this visible line:

> "Beta notice: Please use a funny fake password while we test security/privacy features."

(Passwords will still be securely hashed by Supabase Auth.)
