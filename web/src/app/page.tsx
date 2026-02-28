"use client";

import Link from "next/link";
import AuthStateGate from "@/components/auth-state-gate";
import HomeYesterdayWinners from "@/components/home-yesterday-winners";
import TopNav from "@/components/top-nav";
import { CardSkeleton } from "@/components/ui-skeletons";
import { LoadingState } from "@/components/ui-states";

function LoggedOutHome() {
  return (
    <>
      <h1>FlagPlant</h1>
      <p className="muted">
        FlagPlant is your daily NBA take-and-trade game. Sign in to submit
        opinions, vote, and manage your player portfolio.
      </p>

      <div className="card">
        <h2>Get Started</h2>
        <p className="muted">
          Create an account or sign in to open your dashboard and start with 100
          liquid flags.
        </p>
        <p>
          <Link href="/auth">Go to Auth</Link>
        </p>
      </div>
    </>
  );
}

function LoggedInHome() {
  return (
    <>
      <h1>FlagPlant</h1>
      <p className="muted">
        Your Supabase database is live. This app now includes auth, protected
        pages, a daily opinion submit flow, voting, winner admin tools, and a
        first market order workflow.
      </p>

      <div className="card">
        <h2>Next Actions</h2>
        <ol>
          <li>Open User Profile and confirm your account status.</li>
          <li>Open Ball Knowledge for daily opinion + voting.</li>
          <li>Open Flag Market and place buy/sell orders.</li>
          <li>Use Admin Mode from User Profile if you are admin.</li>
          <li>Run order clearing + repricing from Admin tools.</li>
          <li>Open Leaderboard and compare net worth rankings.</li>
          <li>Use Leaderboard tabs to switch to previous winners.</li>
        </ol>
      </div>

      <HomeYesterdayWinners />
    </>
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
