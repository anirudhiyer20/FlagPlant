"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import RequireAuth from "@/components/require-auth";
import { formatFlagAmount, formatTwoDecimals } from "@/lib/format";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type PublicProfileSnapshotRow = {
  result_user_id: string;
  result_username: string;
  result_liquid_flags: number;
  result_holdings_value: number;
  result_holdings_cost_basis: number;
  result_unrealized_pnl: number;
  result_unrealized_return_pct: number | null;
  result_net_worth: number;
  result_liquid_share_pct: number | null;
  result_invested_share_pct: number | null;
  result_holding_count: number;
  result_top_holding_player_name: string | null;
  result_top_holding_value: number | null;
  result_latest_winner_date: string | null;
  result_latest_winner_rank: number | null;
  result_latest_winner_votes: number | null;
  result_latest_winner_reward_flags: number | null;
  result_latest_winner_opinion: string | null;
};

type PublicProfileHoldingRow = {
  result_player_id: string;
  result_player_name: string;
  result_units: number;
  result_avg_cost_basis: number;
  result_current_price: number;
  result_cost_basis_value: number;
  result_market_value: number;
  result_unrealized_pnl: number;
};

function formatSignedFlag(value: number): string {
  if (value > 0) return `+${formatFlagAmount(value)}`;
  if (value < 0) return `-${formatFlagAmount(Math.abs(value))}`;
  return formatFlagAmount(0);
}

export default function PublicProfilePage() {
  const params = useParams<{ id: string }>();
  const profileUserId = useMemo(() => params?.id ?? "", [params]);

  return (
    <main>
      <h1>Public Profile</h1>
      <p>
        <Link href="/leaderboard">Back to Leaderboard</Link>
      </p>
      <p>
        <Link href="/dashboard">Go to Dashboard</Link>
      </p>
      <p>
        <Link href="/players">Go to Players</Link>
      </p>
      <RequireAuth>
        {(session) => (
          <PublicProfilePanel
            viewerUserId={session.user.id}
            profileUserId={profileUserId}
          />
        )}
      </RequireAuth>
    </main>
  );
}

function PublicProfilePanel({
  viewerUserId,
  profileUserId
}: {
  viewerUserId: string;
  profileUserId: string;
}) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [snapshot, setSnapshot] = useState<PublicProfileSnapshotRow | null>(null);
  const [holdings, setHoldings] = useState<PublicProfileHoldingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadProfile = useCallback(async () => {
    if (!profileUserId) {
      setError("Missing profile id in route.");
      setLoading(false);
      return;
    }

    setBusy(true);
    setError("");

    const snapshotQuery = supabase.rpc("get_public_profile_snapshot", {
      target_user_id: profileUserId
    });
    const holdingsQuery = supabase.rpc("get_public_profile_holdings", {
      target_user_id: profileUserId
    });

    const [snapshotResult, holdingsResult] = await Promise.all([
      snapshotQuery,
      holdingsQuery
    ]);

    if (snapshotResult.error) {
      setError(snapshotResult.error.message);
      setSnapshot(null);
      setHoldings([]);
      setLoading(false);
      setBusy(false);
      return;
    }
    if (holdingsResult.error) {
      setError(holdingsResult.error.message);
      setSnapshot(null);
      setHoldings([]);
      setLoading(false);
      setBusy(false);
      return;
    }

    const snapshotRows = (snapshotResult.data ?? []) as PublicProfileSnapshotRow[];
    setSnapshot(snapshotRows[0] ?? null);
    setHoldings((holdingsResult.data ?? []) as PublicProfileHoldingRow[]);
    setLoading(false);
    setBusy(false);
  }, [profileUserId, supabase]);

  useEffect(() => {
    loadProfile().catch((loadError: unknown) => {
      const msg = loadError instanceof Error ? loadError.message : "Unknown load error";
      setError(msg);
      setSnapshot(null);
      setHoldings([]);
      setLoading(false);
      setBusy(false);
    });
  }, [loadProfile]);

  if (loading) {
    return (
      <div className="card">
        <p>Loading public profile...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <p className="error">{error}</p>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="card">
        <p className="muted">Profile not found.</p>
      </div>
    );
  }

  const isCurrentUser = snapshot.result_user_id === viewerUserId;

  return (
    <div className="grid">
      <div className="card">
        <h2>
          {snapshot.result_username}
          {isCurrentUser ? " (You)" : ""}
        </h2>
        <button type="button" onClick={loadProfile} disabled={busy}>
          {busy ? "Refreshing..." : "Refresh profile"}
        </button>
      </div>

      <div className="card">
        <h2>Wallet</h2>
        <p>
          Liquid flags: <strong>{formatFlagAmount(snapshot.result_liquid_flags)}</strong>
        </p>
        <p>
          Holdings market value:{" "}
          <strong>{formatFlagAmount(snapshot.result_holdings_value)}</strong>
        </p>
        <p>
          Total net worth: <strong>{formatFlagAmount(snapshot.result_net_worth)}</strong>
        </p>
      </div>

      <div className="card">
        <h2>Portfolio Metrics</h2>
        <p>
          Holdings cost basis:{" "}
          <strong>{formatFlagAmount(snapshot.result_holdings_cost_basis)}</strong>
        </p>
        <p>
          Unrealized P/L:{" "}
          <strong>{formatSignedFlag(snapshot.result_unrealized_pnl)}</strong>
        </p>
        <p>
          Unrealized return:{" "}
          <strong>
            {snapshot.result_unrealized_return_pct === null
              ? "--"
              : `${formatTwoDecimals(snapshot.result_unrealized_return_pct)}%`}
          </strong>
        </p>
        <p>
          Allocation (Liquid / Invested):{" "}
          <strong>
            {snapshot.result_liquid_share_pct === null ||
            snapshot.result_invested_share_pct === null
              ? "--"
              : `${formatTwoDecimals(snapshot.result_liquid_share_pct)}% / ${formatTwoDecimals(snapshot.result_invested_share_pct)}%`}
          </strong>
        </p>
        <p>
          Holdings count: <strong>{snapshot.result_holding_count}</strong>
        </p>
        <p>
          Top holding by value:{" "}
          <strong>
            {snapshot.result_top_holding_player_name
              ? `${snapshot.result_top_holding_player_name} (${formatFlagAmount(snapshot.result_top_holding_value)})`
              : "--"}
          </strong>
        </p>
      </div>

      <div className="card">
        <h2>Holdings</h2>
        {holdings.length === 0 ? (
          <p className="muted">No holdings.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Player</th>
                <th>Units</th>
                <th>Avg Cost</th>
                <th>Current Price</th>
                <th>Cost Basis</th>
                <th>Market Value</th>
                <th>Unrealized P/L</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((holding) => (
                <tr key={holding.result_player_id}>
                  <td>{holding.result_player_name}</td>
                  <td>{formatTwoDecimals(holding.result_units)}</td>
                  <td>{formatFlagAmount(holding.result_avg_cost_basis)}</td>
                  <td>{formatFlagAmount(holding.result_current_price)}</td>
                  <td>{formatFlagAmount(holding.result_cost_basis_value)}</td>
                  <td>{formatFlagAmount(holding.result_market_value)}</td>
                  <td>{formatSignedFlag(holding.result_unrealized_pnl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Latest Winner Result</h2>
        {snapshot.result_latest_winner_date ? (
          <>
            <p>Date: {snapshot.result_latest_winner_date}</p>
            <p>Rank: {snapshot.result_latest_winner_rank}</p>
            <p>Votes: {snapshot.result_latest_winner_votes}</p>
            <p>
              Reward flags:{" "}
              {formatFlagAmount(snapshot.result_latest_winner_reward_flags)}
            </p>
            <p>Winning opinion:</p>
            <p>{snapshot.result_latest_winner_opinion ?? "--"}</p>
          </>
        ) : (
          <p className="muted">No winner result yet for this account.</p>
        )}
      </div>
    </div>
  );
}
