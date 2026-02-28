import HomeYesterdayWinners from "@/components/home-yesterday-winners";
import TopNav from "@/components/top-nav";

export default function HomePage() {
  return (
    <main>
      <TopNav />
      <h1>FlagPlant</h1>
      <p className="muted">
        Your Supabase database is live. This app now includes auth, protected
        pages, a daily opinion submit flow, voting, winner admin tools, and a
        first market order workflow.
      </p>

      <div className="card">
        <h2>Next Actions</h2>
        <ol>
          <li>Open auth and log in.</li>
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
    </main>
  );
}
