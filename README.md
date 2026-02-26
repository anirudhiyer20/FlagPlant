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

---

## Notes for beta safety messaging

On signup UI (next phase), include this visible line:

> "Beta notice: Please use a funny fake password while we test security/privacy features."

(Passwords will still be securely hashed by Supabase Auth.)
