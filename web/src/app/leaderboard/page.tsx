"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import RequireAuth from "@/components/require-auth";
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

export default function LeaderboardPage() {
  return (
    <main>
      <h1>Leaderboard</h1>
      <p>
        <Link href="/">Back to Home</Link>
      </p>
      <p>
        <Link href="/dashboard">Go to Dashboard</Link>
      </p>
      <p>
        <Link href="/players">Go to Players</Link>
      </p>
      <p>
        <Link href="/orders">Go to My Orders</Link>
      </p>
      <p>
        <Link href="/winners">Go to Winner History</Link>
      </p>
      <RequireAuth>{(session) => <LeaderboardPanel userId={session.user.id} />}</RequireAuth>
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
      <button type="button" onClick={loadLeaderboard} disabled={busy}>
        {busy ? "Refreshing..." : "Refresh Leaderboard"}
      </button>
      <p>
        <label>
          <input
            type="checkbox"
            checked={showFriendsOnly}
            onChange={(event) => setShowFriendsOnly(event.target.checked)}
          />{" "}
          Friends only
        </label>
      </p>
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
    </div>
  );
}
