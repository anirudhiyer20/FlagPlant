import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <h1>FlagPlant Phase 2 Starter</h1>
      <p className="muted">
        Your Supabase database is live. This app now adds local auth and a live
        players read from `public.players`.
      </p>

      <div className="card">
        <h2>Next Actions</h2>
        <ol>
          <li>Open the auth page and create/sign in a user.</li>
          <li>Open players page and confirm seeded prices render.</li>
          <li>Check Supabase Table Editor for new profile and wallet rows.</li>
        </ol>
      </div>

      <div className="card">
        <h2>Pages</h2>
        <p>
          <Link href="/auth">Go to Auth</Link>
        </p>
        <p>
          <Link href="/players">Go to Players</Link>
        </p>
      </div>
    </main>
  );
}
