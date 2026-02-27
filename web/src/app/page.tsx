import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <h1>FlagPlant Phase 2 Starter</h1>
      <p className="muted">
        Your Supabase database is live. This app now includes auth, protected
        pages, a daily opinion submit flow, and a live players list.
      </p>

      <div className="card">
        <h2>Next Actions</h2>
        <ol>
          <li>Open auth and log in.</li>
          <li>Open daily opinion and submit once for today.</li>
          <li>Open vote and cast votes on assigned opinions.</li>
          <li>Open players and confirm seeded prices render.</li>
        </ol>
      </div>

      <div className="card">
        <h2>Pages</h2>
        <p>
          <Link href="/auth">Go to Auth</Link>
        </p>
        <p>
          <Link href="/opinion">Go to Daily Opinion</Link>
        </p>
        <p>
          <Link href="/vote">Go to Vote</Link>
        </p>
        <p>
          <Link href="/players">Go to Players</Link>
        </p>
      </div>
    </main>
  );
}
