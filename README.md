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
- Player detail page (`/players/[id]`) with buy-order form
- Orders page (`/orders`) for personal order history

If you already set up Supabase before this update, run
`supabase/patch_vote_policy.sql` once in Supabase SQL Editor to apply the latest
RLS policy changes for voting reads.
Also run `supabase/patch_admin_winners.sql` once to add admin winner RPC tools.
Also run `supabase/patch_order_budget_policy.sql` once to enforce combined
pending buy-order budget limits against wallet balance.
Also run `supabase/patch_order_execution.sql` once to add admin order-clearing
RPC tools (pending buy execution into holdings/wallet/ledger).

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
14. Open `/admin`, choose date, preview pending buy orders, then execute pending buys.
15. Open `/orders` and confirm status changes to `executed` (or `failed` if invalid at execution).
16. Refresh `/dashboard` and confirm holdings + wallet values update after execution.

---

## Notes for beta safety messaging

On signup UI (next phase), include this visible line:

> "Beta notice: Please use a funny fake password while we test security/privacy features."

(Passwords will still be securely hashed by Supabase Auth.)
