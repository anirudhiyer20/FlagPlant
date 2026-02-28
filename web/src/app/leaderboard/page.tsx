"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import RequireAuth from "@/components/require-auth";
import TopNav from "@/components/top-nav";
import { formatFlagAmount } from "@/lib/format";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type LeaderboardRow = {
  result_rank: number;
  result_user_id: string;
  result_username: string;
  result_liquid_flags: number;
  result_holdings_value: number;
  result_net_worth: number;
  result_holding_count: number;
};

type WinnerHistoryRow = {
  result_winner_date: string;
  result_rank: number;
  result_user_id: string;
  result_username: string;
  result_opinion_id: string;
  result_opinion_body: string | null;
  result_votes_received: number;
  result_reward_flags: number;
};

type LeaderboardTab = "leaderboard" | "winners";

export default function LeaderboardPage() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<LeaderboardTab>("leaderboard");

  useEffect(() => {
    setActiveTab(searchParams.get("tab") === "winners" ? "winners" : "leaderboard");
  }, [searchParams]);

  return (
    <main>
      <TopNav />
      <h1>Leaderboard</h1>
      <div className="card">
        <div className="tab-row">
          <button
            type="button"
            onClick={() => setActiveTab("leaderboard")}
            className={activeTab === "leaderboard" ? "" : "secondary"}
          >
            Leaderboard
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("winners")}
            className={activeTab === "winners" ? "" : "secondary"}
          >
            Previous Winners
          </button>
        </div>
      </div>
      <RequireAuth>
        {(session) =>
          activeTab === "leaderboard" ? (
            <LeaderboardPanel userId={session.user.id} />
          ) : (
            <WinnerHistoryPanel />
          )
        }
      </RequireAuth>
    </main>
  );
}

function LeaderboardPanel({ userId }: { userId: string }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [showFriendsOnly, setShowFriendsOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadLeaderboard = useCallback(async () => {
    setBusy(true);
    setError("");

    const { data, error: leaderboardError } = await supabase.rpc(
      "get_leaderboard_snapshot_scoped",
      {
        view_mode: showFriendsOnly ? "friends_only" : "global"
      }
    );

    if (leaderboardError) {
      setError(leaderboardError.message);
      setRows([]);
      setLoading(false);
      setBusy(false);
      return;
    }

    setRows((data ?? []) as LeaderboardRow[]);
    setLoading(false);
    setBusy(false);
  }, [showFriendsOnly, supabase]);

  useEffect(() => {
    loadLeaderboard().catch((loadError: unknown) => {
      const msg = loadError instanceof Error ? loadError.message : "Unknown load error";
      setError(msg);
      setRows([]);
      setLoading(false);
      setBusy(false);
    });
  }, [loadLeaderboard]);

  return (
    <div className="card">
      <div className="tab-row">
        <button
          type="button"
          onClick={() => setShowFriendsOnly(false)}
          className={!showFriendsOnly ? "" : "secondary"}
        >
          Global View
        </button>
        <button
          type="button"
          onClick={() => setShowFriendsOnly(true)}
          className={showFriendsOnly ? "" : "secondary"}
        >
          Friends View
        </button>
      </div>
      <p className="muted">Friends are mutual follows.</p>

      {loading ? <p>Loading leaderboard...</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {!loading && !error && rows.length === 0 ? (
        <p className="muted">No leaderboard rows yet.</p>
      ) : null}

      {!loading && !error && rows.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>User</th>
              <th>Net Worth</th>
              <th>Unplanted</th>
              <th>FlagPlants Value</th>
              <th>FlagPlants</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isCurrentUser = row.result_user_id === userId;
              return (
                <tr key={row.result_user_id}>
                  <td>{row.result_rank}</td>
                  <td>
                    {isCurrentUser ? (
                      <strong>
                        <Link href={`/profiles/${row.result_user_id}`}>
                          {row.result_username} (You)
                        </Link>
                      </strong>
                    ) : (
                      <Link href={`/profiles/${row.result_user_id}`}>
                        {row.result_username}
                      </Link>
                    )}
                  </td>
                  <td>{formatFlagAmount(row.result_net_worth)}</td>
                  <td>{formatFlagAmount(row.result_liquid_flags)}</td>
                  <td>{formatFlagAmount(row.result_holdings_value)}</td>
                  <td>{row.result_holding_count}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}

      <button type="button" onClick={loadLeaderboard} disabled={busy}>
        {busy ? "Refreshing..." : "Refresh Leaderboard"}
      </button>
    </div>
  );
}

function WinnerHistoryPanel() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [rows, setRows] = useState<WinnerHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [days, setDays] = useState(14);

  const loadHistory = useCallback(async () => {
    setBusy(true);
    setError("");

    const { data, error: historyError } = await supabase.rpc(
      "get_recent_winner_boards",
      { limit_days: days }
    );

    if (historyError) {
      setError(historyError.message);
      setRows([]);
      setLoading(false);
      setBusy(false);
      return;
    }

    setRows((data ?? []) as WinnerHistoryRow[]);
    setLoading(false);
    setBusy(false);
  }, [days, supabase]);

  useEffect(() => {
    loadHistory().catch((loadError: unknown) => {
      const msg = loadError instanceof Error ? loadError.message : "Unknown load error";
      setError(msg);
      setRows([]);
      setLoading(false);
      setBusy(false);
    });
  }, [loadHistory]);

  const grouped = rows.reduce<Record<string, WinnerHistoryRow[]>>((acc, row) => {
    if (!acc[row.result_winner_date]) acc[row.result_winner_date] = [];
    acc[row.result_winner_date].push(row);
    return acc;
  }, {});
  const orderedDates = Object.keys(grouped).sort((a, b) => (a < b ? 1 : -1));

  return (
    <div className="card">
      <label>
        Days to show
        <input
          type="number"
          min="1"
          max="90"
          step="1"
          value={days}
          onChange={(e) => setDays(Number.parseInt(e.target.value || "14", 10))}
        />
      </label>
      <button type="button" onClick={loadHistory} disabled={busy}>
        {busy ? "Refreshing..." : "Refresh Previous Winners"}
      </button>

      {loading ? <p>Loading winner history...</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {!loading && !error && orderedDates.length === 0 ? (
        <p className="muted">No published winner history yet.</p>
      ) : null}

      {!loading && !error
        ? orderedDates.map((winnerDate) => (
            <div className="card" key={winnerDate}>
              <h2>{winnerDate}</h2>
              <table>
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>User</th>
                    <th>Opinion</th>
                    <th>Votes</th>
                    <th>Reward</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped[winnerDate].map((row) => (
                    <tr key={`${row.result_winner_date}-${row.result_rank}-${row.result_opinion_id}`}>
                      <td>{row.result_rank}</td>
                      <td>
                        <Link href={`/profiles/${row.result_user_id}`}>{row.result_username}</Link>
                      </td>
                      <td>{row.result_opinion_body ?? "--"}</td>
                      <td>{row.result_votes_received}</td>
                      <td>{formatFlagAmount(row.result_reward_flags)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        : null}
    </div>
  );
}
