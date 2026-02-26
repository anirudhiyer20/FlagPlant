# FlagPlant Next Steps (after Phase 1)

This checklist is intentionally beginner-friendly.

## Phase 2 goals
- Build Next.js app scaffold
- Connect Supabase Auth (signup/login)
- Build daily home screen shell
- Show seeded players and prices

## Accounts and keys you will need
1. Supabase Project URL
2. Supabase anon key
3. Supabase service role key (server-only)
4. Vercel account linked to your Git provider

## Suggested local `.env.local` keys

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

## Common beginner pitfalls
- Do not expose `SUPABASE_SERVICE_ROLE_KEY` in browser/client code.
- Keep RLS enabled on user tables.
- Always test signup creates both `profiles` and `wallets` rows.
- Verify a new user starts with exactly `100` liquid flags.

## Manual smoke test after app auth is added
1. Sign up a new account.
2. Confirm `profiles` row exists.
3. Confirm `wallets.liquid_flags = 100`.
4. Attempt to query another user's wallet from client (should fail due to RLS).
