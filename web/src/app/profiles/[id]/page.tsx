"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import RequireAuth from "@/components/require-auth";
import PortfolioHistoryChart, {
  type PortfolioHistoryPoint
} from "@/components/portfolio-history-chart";
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

type PortfolioHistoryRawRow = {
  result_snap_date: string;
  result_unplanted_flags_close: number;
  result_planted_value_close: number;
  result_total_value_close: number;
  result_holdings_json: unknown;
};

type FollowStateRow = {
  result_target_user_id: string;
  result_is_following: boolean;
  result_follows_you: boolean;
  result_follower_count: number;
  result_following_count: number;
};

type FollowListRow = {
  result_user_id: string;
  result_username: string;
  result_followed_at: string;
};

function formatSignedFlag(value: number): string {
  if (value > 0) return `+${formatFlagAmount(value)}`;
  if (value < 0) return `-${formatFlagAmount(Math.abs(value))}`;
  return formatFlagAmount(0);
}

function parseHistoryHoldings(raw: unknown): PortfolioHistoryPoint["holdings"] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      return {
        player_name:
          typeof row.player_name === "string" ? row.player_name : "Unknown",
        units:
          typeof row.units === "number"
            ? row.units
            : Number.parseFloat(String(row.units ?? 0)),
        value:
          typeof row.value === "number"
            ? row.value
            : Number.parseFloat(String(row.value ?? 0))
      };
    })
    .filter(
      (item): item is PortfolioHistoryPoint["holdings"][number] =>
        item !== null && Number.isFinite(item.units) && Number.isFinite(item.value)
    );
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
  const [portfolioHistory, setPortfolioHistory] = useState<PortfolioHistoryPoint[]>([]);
  const [followState, setFollowState] = useState<FollowStateRow | null>(null);
  const [followers, setFollowers] = useState<FollowListRow[]>([]);
  const [following, setFollowing] = useState<FollowListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [activeConnectionList, setActiveConnectionList] = useState<
    "followers" | "following" | "none"
  >("none");
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
    const portfolioHistoryQuery = supabase.rpc("get_user_portfolio_history", {
      target_user_id: profileUserId,
      lookback_days: 30
    });
    const followStateQuery = supabase.rpc("get_follow_state", {
      target_user_id: profileUserId
    });
    const followersQuery = supabase.rpc("get_follow_list", {
      target_user_id: profileUserId,
      list_kind: "followers",
      limit_count: 8
    });
    const followingQuery = supabase.rpc("get_follow_list", {
      target_user_id: profileUserId,
      list_kind: "following",
      limit_count: 8
    });

    const [
      snapshotResult,
      holdingsResult,
      portfolioHistoryResult,
      followStateResult,
      followersResult,
      followingResult
    ] = await Promise.all([
      snapshotQuery,
      holdingsQuery,
      portfolioHistoryQuery,
      followStateQuery,
      followersQuery,
      followingQuery
    ]);

    if (snapshotResult.error) {
      setError(snapshotResult.error.message);
      setSnapshot(null);
      setHoldings([]);
      setPortfolioHistory([]);
      setFollowState(null);
      setFollowers([]);
      setFollowing([]);
      setLoading(false);
      setBusy(false);
      return;
    }
    if (holdingsResult.error) {
      setError(holdingsResult.error.message);
      setSnapshot(null);
      setHoldings([]);
      setPortfolioHistory([]);
      setFollowState(null);
      setFollowers([]);
      setFollowing([]);
      setLoading(false);
      setBusy(false);
      return;
    }
    if (portfolioHistoryResult.error) {
      setError(portfolioHistoryResult.error.message);
      setSnapshot(null);
      setHoldings([]);
      setPortfolioHistory([]);
      setFollowState(null);
      setFollowers([]);
      setFollowing([]);
      setLoading(false);
      setBusy(false);
      return;
    }
    if (followStateResult.error) {
      setError(followStateResult.error.message);
      setSnapshot(null);
      setHoldings([]);
      setPortfolioHistory([]);
      setFollowState(null);
      setFollowers([]);
      setFollowing([]);
      setLoading(false);
      setBusy(false);
      return;
    }
    if (followersResult.error) {
      setError(followersResult.error.message);
      setSnapshot(null);
      setHoldings([]);
      setPortfolioHistory([]);
      setFollowState(null);
      setFollowers([]);
      setFollowing([]);
      setLoading(false);
      setBusy(false);
      return;
    }
    if (followingResult.error) {
      setError(followingResult.error.message);
      setSnapshot(null);
      setHoldings([]);
      setPortfolioHistory([]);
      setFollowState(null);
      setFollowers([]);
      setFollowing([]);
      setLoading(false);
      setBusy(false);
      return;
    }

    const snapshotRows = (snapshotResult.data ?? []) as PublicProfileSnapshotRow[];
    setSnapshot(snapshotRows[0] ?? null);
    setHoldings((holdingsResult.data ?? []) as PublicProfileHoldingRow[]);
    const historyRows = (portfolioHistoryResult.data ?? []) as PortfolioHistoryRawRow[];
    setPortfolioHistory(
      historyRows.map((row) => ({
        snap_date: row.result_snap_date,
        unplanted_close: row.result_unplanted_flags_close ?? 0,
        planted_close: row.result_planted_value_close ?? 0,
        total_close: row.result_total_value_close ?? 0,
        holdings: parseHistoryHoldings(row.result_holdings_json)
      }))
    );
    const followStateRows = (followStateResult.data ?? []) as FollowStateRow[];
    setFollowState(followStateRows[0] ?? null);
    setFollowers((followersResult.data ?? []) as FollowListRow[]);
    setFollowing((followingResult.data ?? []) as FollowListRow[]);
    setLoading(false);
    setBusy(false);
  }, [profileUserId, supabase]);

  useEffect(() => {
    setActiveConnectionList("none");
    loadProfile().catch((loadError: unknown) => {
      const msg = loadError instanceof Error ? loadError.message : "Unknown load error";
      setError(msg);
      setSnapshot(null);
      setHoldings([]);
      setPortfolioHistory([]);
      setFollowState(null);
      setFollowers([]);
      setFollowing([]);
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
  const isFollowing = followState?.result_is_following ?? false;
  const activeConnectionRows =
    activeConnectionList === "followers"
      ? followers
      : activeConnectionList === "following"
        ? following
        : [];

  const toggleFollow = async () => {
    if (isCurrentUser || !profileUserId) return;
    setFollowBusy(true);
    setError("");

    const fnName = isFollowing ? "unfollow_user" : "follow_user";
    const { error: followError } = await supabase.rpc(fnName, {
      target_user_id: profileUserId
    });

    if (followError) {
      setError(followError.message);
      setFollowBusy(false);
      return;
    }

    await loadProfile();
    setFollowBusy(false);
  };

  return (
    <div className="grid">
      <div className="card">
        <h2>
          {snapshot.result_username}
          {isCurrentUser ? " (You)" : ""}
        </h2>
        {!isCurrentUser ? (
          <>
            <button type="button" onClick={toggleFollow} disabled={busy || followBusy}>
              {followBusy
                ? "Saving..."
                : isFollowing
                  ? "Unfollow"
                  : "Follow"}
            </button>
            {followState?.result_follows_you ? <p>Follows you</p> : null}
          </>
        ) : null}
        <p>
          Followers:{" "}
          <button
            type="button"
            onClick={() =>
              setActiveConnectionList((current) =>
                current === "followers" ? "none" : "followers"
              )
            }
          >
            {followState?.result_follower_count ?? 0}
          </button>
        </p>
        <p>
          Following:{" "}
          <button
            type="button"
            onClick={() =>
              setActiveConnectionList((current) =>
                current === "following" ? "none" : "following"
              )
            }
          >
            {followState?.result_following_count ?? 0}
          </button>
        </p>
        <button type="button" onClick={loadProfile} disabled={busy}>
          {busy ? "Refreshing..." : "Refresh profile"}
        </button>
      </div>

      <div className="card">
        <h2>Wallet</h2>
        <p>
          Unplanted flags: <strong>{formatFlagAmount(snapshot.result_liquid_flags)}</strong>
        </p>
        <p>
          FlagPlants value:{" "}
          <strong>{formatFlagAmount(snapshot.result_holdings_value)}</strong>
        </p>
        <p>
          Total net worth: <strong>{formatFlagAmount(snapshot.result_net_worth)}</strong>
        </p>
      </div>

      <div className="card">
        <h2>Portfolio Metrics</h2>
        <p>
          FlagPlants cost basis:{" "}
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
          Allocation (Unplanted / Planted):{" "}
          <strong>
            {snapshot.result_liquid_share_pct === null ||
            snapshot.result_invested_share_pct === null
              ? "--"
              : `${formatTwoDecimals(snapshot.result_liquid_share_pct)}% / ${formatTwoDecimals(snapshot.result_invested_share_pct)}%`}
          </strong>
        </p>
        <p>
          FlagPlants count: <strong>{snapshot.result_holding_count}</strong>
        </p>
        <p>
          Top FlagPlant by value:{" "}
          <strong>
            {snapshot.result_top_holding_player_name
              ? `${snapshot.result_top_holding_player_name} (${formatFlagAmount(snapshot.result_top_holding_value)})`
              : "--"}
          </strong>
        </p>
        <PortfolioHistoryChart points={portfolioHistory} />
      </div>

      <div className="card">
        <h2>FlagPlants</h2>
        {holdings.length === 0 ? (
          <p className="muted">No FlagPlants.</p>
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
        <h2>Connections</h2>
        {activeConnectionList === "none" ? (
          <p className="muted">
            Click follower/following count above to view the list.
          </p>
        ) : (
          <>
            <p>
              <strong>
                {activeConnectionList === "followers" ? "Followers" : "Following"}
              </strong>
            </p>
            {activeConnectionRows.length === 0 ? (
              <p className="muted">No users in this list yet.</p>
            ) : (
              <ul>
                {activeConnectionRows.map((row) => (
                  <li key={`${activeConnectionList}-${row.result_user_id}`}>
                    <Link href={`/profiles/${row.result_user_id}`}>{row.result_username}</Link>
                  </li>
                ))}
              </ul>
            )}
          </>
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
