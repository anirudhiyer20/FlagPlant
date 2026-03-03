"use client";

import Link from "next/link";
import AuthStateGate from "@/components/auth-state-gate";
import HomeYesterdayWinners from "@/components/home-yesterday-winners";
import TopNav from "@/components/top-nav";
import { CardSkeleton } from "@/components/ui-skeletons";
import { LoadingState } from "@/components/ui-states";

function LoggedOutHome() {
  return (
    <div className="home-shell">
      <section className="card home-hero">
        <div className="home-hero-content">
          <p className="home-kicker">Daily NBA Takes + Trading</p>
          <h1>FlagPlant</h1>
          <p className="muted">
            Submit your daily opinion, vote the next day, and build your portfolio
            with market-style player orders.
          </p>
          <div className="home-cta-row">
            <Link href="/auth" className="hero-cta primary">
              Start With 100 Flags
            </Link>
            <Link href="/leaderboard" className="hero-cta">
              Explore Leaderboard
            </Link>
          </div>
        </div>
        <div className="home-stat-grid">
          <article className="home-stat-tile">
            <p className="home-stat-value">100</p>
            <p className="muted">Starting Unplanted Flags</p>
          </article>
          <article className="home-stat-tile">
            <p className="home-stat-value">D+1</p>
            <p className="muted">Voting Cadence</p>
          </article>
          <article className="home-stat-tile">
            <p className="home-stat-value">00:00 ET</p>
            <p className="muted">Daily Close Window</p>
          </article>
        </div>
      </section>

      <section className="home-grid">
        <div className="card home-feature-card">
          <h2>Ball Knowledge</h2>
          <p className="muted">
            Post one opinion each ET day and come back tomorrow to vote on assigned takes.
          </p>
        </div>
        <div className="card home-feature-card">
          <h2>Flag Market</h2>
          <p className="muted">
            Place buy and sell orders on players and let the daily close apply execution +
            repricing.
          </p>
        </div>
        <div className="card home-feature-card">
          <h2>Competitive Loop</h2>
          <p className="muted">
            Winners earn reward flags, and net worth rankings update as your strategy compounds.
          </p>
        </div>
      </section>
    </div>
  );
}

function LoggedInHome() {
  return (
    <div className="home-shell">
      <section className="card home-hero">
        <div className="home-hero-content">
          <p className="home-kicker">Today&apos;s Session</p>
          <h1>Run The Day&apos;s Cycle</h1>
          <p className="muted">
            Move through the daily loop quickly: submit, vote, trade, and track
            your position against everyone else.
          </p>
          <div className="home-cta-row">
            <Link href="/ball-knowledge" className="hero-cta primary">
              Open Ball Knowledge
            </Link>
            <Link href="/flag-market" className="hero-cta">
              Open Flag Market
            </Link>
            <Link href="/dashboard" className="hero-cta">
              Open User Profile
            </Link>
          </div>
        </div>
        <div className="home-stat-grid">
          <article className="home-stat-tile">
            <p className="home-stat-value">1</p>
            <p className="muted">Opinion Per Day</p>
          </article>
          <article className="home-stat-tile">
            <p className="home-stat-value">5</p>
            <p className="muted">Top Winners Published</p>
          </article>
          <article className="home-stat-tile">
            <p className="home-stat-value">ET</p>
            <p className="muted">Business Date Standard</p>
          </article>
        </div>
      </section>

      <section className="home-grid">
        <div className="card home-feature-card">
          <h2>Priority Queue</h2>
          <ol className="home-focus-list">
            <li>Submit your daily opinion.</li>
            <li>Cast votes on assigned takes.</li>
            <li>Place and monitor market orders.</li>
            <li>Check leaderboard delta and winners.</li>
          </ol>
        </div>
        <div className="card home-feature-card">
          <h2>Cadence Snapshot</h2>
          <p className="muted">
            At midnight ET, day-D winners publish, day-D orders clear, repricing
            applies, and day-(D+1) voting assignments are generated.
          </p>
        </div>
      </section>

      <HomeYesterdayWinners />
    </div>
  );
}

export default function HomePage() {
  return (
    <main>
      <TopNav />
      <AuthStateGate
        onLoading={() => (
          <div className="grid">
            <h1>FlagPlant</h1>
            <LoadingState message="Loading home..." variant="card" />
            <CardSkeleton />
          </div>
        )}
        onSignedOut={() => <LoggedOutHome />}
        onSignedIn={() => <LoggedInHome />}
      />
    </main>
  );
}
