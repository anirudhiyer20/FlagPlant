"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getEasternDateString } from "@/lib/dates";
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

export default function HomeYesterdayWinners() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [rows, setRows] = useState<WinnerHistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const yesterdayEt = useMemo(() => {
    const value = new Date();
    value.setDate(value.getDate() - 1);
    return getEasternDateString(value);
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSessionUserId(data.session?.user.id ?? null);
      setSessionChecked(true);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionUserId(session?.user.id ?? null);
      setSessionChecked(true);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase.auth]);

  const loadWinners = useCallback(async () => {
    if (!sessionUserId) return;
    setLoading(true);
    setError("");

    const { data, error: winnersError } = await supabase.rpc("get_recent_winner_boards", {
      limit_days: 3
    });

    if (winnersError) {
      setError(winnersError.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const allRows = (data ?? []) as WinnerHistoryRow[];
    const yesterdayRows = allRows.filter((row) => row.result_winner_date === yesterdayEt);

    if (yesterdayRows.length > 0) {
      setRows(yesterdayRows);
      setLoading(false);
      return;
    }

    const fallbackDate = allRows
      .map((row) => row.result_winner_date)
      .sort((a, b) => (a < b ? 1 : -1))[0];

    setRows(
      fallbackDate ? allRows.filter((row) => row.result_winner_date === fallbackDate) : []
    );
    setLoading(false);
  }, [sessionUserId, supabase, yesterdayEt]);

  useEffect(() => {
    loadWinners().catch((loadError: unknown) => {
      const msg = loadError instanceof Error ? loadError.message : "Unknown load error";
      setError(msg);
      setRows([]);
      setLoading(false);
    });
  }, [loadWinners]);

  if (!sessionChecked) {
    return (
      <div className="card">
        <h2>Yesterday&apos;s Winners</h2>
        <p>Checking login status...</p>
      </div>
    );
  }

  if (!sessionUserId) {
    return (
      <div className="card">
        <h2>Yesterday&apos;s Winners</h2>
        <p className="muted">
          Sign in to see the previous day&apos;s winner leaderboard on home.
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Yesterday&apos;s Winners</h2>
      <p className="muted">Target date: {yesterdayEt}</p>
      {loading ? <p>Loading winners...</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {!loading && !error && rows.length === 0 ? (
        <p className="muted">No published winners yet.</p>
      ) : null}

      {!loading && !error && rows.length > 0 ? (
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
            {rows
              .sort((a, b) => a.result_rank - b.result_rank)
              .map((row) => (
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
      ) : null}
    </div>
  );
}
