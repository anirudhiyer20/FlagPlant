"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import RequireAuth from "@/components/require-auth";
import { formatFlagAmount } from "@/lib/format";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

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

export default function WinnersPage() {
  return (
    <main>
      <h1>Winner History</h1>
      <p>
        <Link href="/">Back to Home</Link>
      </p>
      <p>
        <Link href="/dashboard">Go to Dashboard</Link>
      </p>
      <p>
        <Link href="/leaderboard">Go to Leaderboard</Link>
      </p>
      <RequireAuth>{() => <WinnerHistoryPanel />}</RequireAuth>
    </main>
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
        {busy ? "Refreshing..." : "Refresh Winner History"}
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
                      <td>{row.result_username}</td>
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
