"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import RequireAuth from "@/components/require-auth";
import PortfolioHistoryChart, {
  type PortfolioHistoryPoint
} from "@/components/portfolio-history-chart";
import TopNav from "@/components/top-nav";
import { formatFlagAmount, formatTwoDecimals } from "@/lib/format";
import { getLeagueBadgeStyle, normalizeLeagueLabel } from "@/lib/leagues";
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
  result_player_league: string;
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
        player_league:
          typeof row.player_league === "string" ? row.player_league : null,
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
  const router = useRouter();
  const profileUserId = useMemo(() => params?.id ?? "", [params]);

  function onBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/leaderboard");
  }

  return (
    <main>
      <TopNav />
      <h1>Public Profile</h1>
      <button type="button" onClick={onBack}>
        Back
      </button>
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
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<PublicProfileSnapshotRow | null>(null);
  const [holdings, setHoldings] = useState<PublicProfileHoldingRow[]>([]);
  const [portfolioHistory, setPortfolioHistory] = useState<PortfolioHistoryPoint[]>([]);
  const [followState, setFollowState] = useState<FollowStateRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
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

    const [
      snapshotResult,
      holdingsResult,
      portfolioHistoryResult,
      followStateResult
    ] = await Promise.all([
      snapshotQuery,
      holdingsQuery,
      portfolioHistoryQuery,
      followStateQuery
    ]);

    if (snapshotResult.error) {
      setError(snapshotResult.error.message);
      setSnapshot(null);
      setHoldings([]);
      setPortfolioHistory([]);
      setFollowState(null);
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
      setLoading(false);
      setBusy(false);
      return;
    }

    const snapshotRows = (snapshotResult.data ?? []) as PublicProfileSnapshotRow[];
    setSnapshot(snapshotRows[0] ?? null);

    const rawHoldings = (holdingsResult.data ?? []) as Omit<
      PublicProfileHoldingRow,
      "result_player_league"
    >[];
    const holdingPlayerIds = [...new Set(rawHoldings.map((row) => row.result_player_id))];
    let holdingLeagueByPlayerId = new Map<string, string>();

    if (holdingPlayerIds.length > 0) {
      const { data: holdingPlayersData, error: holdingPlayersError } = await supabase
        .from("players")
        .select("id,league")
        .in("id", holdingPlayerIds);

      if (holdingPlayersError) {
        setError(holdingPlayersError.message);
        setSnapshot(null);
        setHoldings([]);
        setPortfolioHistory([]);
        setFollowState(null);
        setLoading(false);
        setBusy(false);
        return;
      }

      holdingLeagueByPlayerId = new Map(
        ((holdingPlayersData ?? []) as { id: string; league: string }[]).map((row) => [
          row.id,
          row.league
        ])
      );
    }

    const holdings = rawHoldings.map((row) => ({
      ...row,
      result_player_league: normalizeLeagueLabel(
        holdingLeagueByPlayerId.get(row.result_player_id)
      )
    }));
    setHoldings(holdings);

    const historyRows = (portfolioHistoryResult.data ?? []) as PortfolioHistoryRawRow[];
    const parsedPortfolioHistory = historyRows.map((row) => ({
        snap_date: row.result_snap_date,
        unplanted_close: row.result_unplanted_flags_close ?? 0,
        planted_close: row.result_planted_value_close ?? 0,
        total_close: row.result_total_value_close ?? 0,
        holdings: parseHistoryHoldings(row.result_holdings_json)
      }));
    const historyPlayerNames = [
      ...new Set(
        parsedPortfolioHistory.flatMap((point) =>
          point.holdings.map((holding) => holding.player_name)
        )
      )
    ].filter((name) => name.length > 0 && name !== "Unknown");
    let historyLeagueByName = new Map<string, string>();

    if (historyPlayerNames.length > 0) {
      const { data: historyPlayersData, error: historyPlayersError } = await supabase
        .from("players")
        .select("name,league")
        .in("name", historyPlayerNames);

      if (historyPlayersError) {
        setError(historyPlayersError.message);
        setSnapshot(null);
        setHoldings([]);
        setPortfolioHistory([]);
        setFollowState(null);
        setLoading(false);
        setBusy(false);
        return;
      }

      historyLeagueByName = new Map(
        ((historyPlayersData ?? []) as { name: string; league: string }[]).map((row) => [
          row.name,
          row.league
        ])
      );
    }

    setPortfolioHistory(
      parsedPortfolioHistory.map((point) => ({
        ...point,
        holdings: point.holdings.map((holding) => ({
          ...holding,
          player_league: normalizeLeagueLabel(
            historyLeagueByName.get(holding.player_name) ?? holding.player_league
          )
        }))
      }))
    );
    const followStateRows = (followStateResult.data ?? []) as FollowStateRow[];
    setFollowState(followStateRows[0] ?? null);
    setLoading(false);
    setBusy(false);
  }, [profileUserId, supabase]);

  useEffect(() => {
    loadProfile().catch((loadError: unknown) => {
      const msg = loadError instanceof Error ? loadError.message : "Unknown load error";
      setError(msg);
      setSnapshot(null);
      setHoldings([]);
      setPortfolioHistory([]);
      setFollowState(null);
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
  const topHoldingLeague = snapshot.result_top_holding_player_name
    ? holdings.find(
        (holding) => holding.result_player_name === snapshot.result_top_holding_player_name
      )?.result_player_league ?? null
    : null;

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
        <div className="account-header">
          <h2>
            {snapshot.result_username}
            {isCurrentUser ? " (You)" : ""}
          </h2>
          {!isCurrentUser ? (
            <div className="public-follow-controls">
              <button type="button" onClick={toggleFollow} disabled={busy || followBusy}>
                {followBusy
                  ? "Saving..."
                  : isFollowing
                    ? "Unfollow"
                    : "Follow"}
              </button>
              {followState?.result_follows_you ? (
                <p className="muted">Follows You</p>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="profile-connection-grid">
          <button
            type="button"
            className="profile-connection-button"
            onClick={() => router.push(`/connections?tab=followers&user=${profileUserId}`)}
          >
            <span className="profile-connection-count">
              {followState?.result_follower_count ?? 0}
            </span>
            <span className="profile-connection-label">
              {(followState?.result_follower_count ?? 0) === 1 ? "Follower" : "Followers"}
            </span>
          </button>
          <button
            type="button"
            className="profile-connection-button"
            onClick={() => router.push(`/connections?tab=following&user=${profileUserId}`)}
          >
            <span className="profile-connection-count">
              {followState?.result_following_count ?? 0}
            </span>
            <span className="profile-connection-label">Following</span>
          </button>
        </div>
      </div>

      <div className="card">
        <h2>Wallet</h2>
        <p>
          Unplanted Flags: <strong>{formatFlagAmount(snapshot.result_liquid_flags)}</strong>
        </p>
        <p>
          FlagPlants Value:{" "}
          <strong>{formatFlagAmount(snapshot.result_holdings_value)}</strong>
        </p>
        <p>
          Total Net Worth: <strong>{formatFlagAmount(snapshot.result_net_worth)}</strong>
        </p>
      </div>

      <div className="card">
        <h2>FlagPlants</h2>
        {holdings.length === 0 ? (
          <p className="muted">No FlagPlants Yet.</p>
        ) : (
          <table className="public-profile-holdings-table">
            <colgroup>
              <col className="public-profile-holdings-col-player" />
              <col />
              <col />
              <col />
              <col />
              <col />
              <col />
            </colgroup>
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
                  <td>
                    <span className="dashboard-player-cell">
                      <Link href={`/players/${holding.result_player_id}`}>
                        <span className="dashboard-player-name">
                          {holding.result_player_name}
                        </span>
                      </Link>
                      <span
                        className="league-badge"
                        style={getLeagueBadgeStyle(holding.result_player_league)}
                      >
                        {holding.result_player_league}
                      </span>
                    </span>
                  </td>
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
              Reward Flags:{" "}
              {formatFlagAmount(snapshot.result_latest_winner_reward_flags)}
            </p>
            <p>Winning Opinion: {snapshot.result_latest_winner_opinion ?? "--"}</p>
          </>
        ) : (
          <p className="muted">No Winner Result Yet For This Account.</p>
        )}
      </div>

      <div className="card">
        <h2>Portfolio Metrics</h2>
        <p>
          FlagPlants Cost Basis:{" "}
          <strong>{formatFlagAmount(snapshot.result_holdings_cost_basis)}</strong>
        </p>
        <p>
          Unrealized P/L:{" "}
          <strong>{formatSignedFlag(snapshot.result_unrealized_pnl)}</strong>
        </p>
        <p>
          Unrealized Return:{" "}
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
          FlagPlants Count: <strong>{snapshot.result_holding_count}</strong>
        </p>
        <p>
          Top FlagPlant By Value:{" "}
          <strong>
            {snapshot.result_top_holding_player_name
              ? (
                <span className="player-cell-with-league">
                  <span>{snapshot.result_top_holding_player_name}</span>
                  <span
                    className="league-badge"
                    style={getLeagueBadgeStyle(normalizeLeagueLabel(topHoldingLeague))}
                  >
                    {normalizeLeagueLabel(topHoldingLeague)}
                  </span>
                  <span>({formatFlagAmount(snapshot.result_top_holding_value)})</span>
                </span>
              )
              : "--"}
          </strong>
        </p>
        <PortfolioHistoryChart points={portfolioHistory} />
      </div>
    </div>
  );
}
