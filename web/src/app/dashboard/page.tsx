"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import RequireAuth from "@/components/require-auth";
import PortfolioHistoryChart, {
  type PortfolioHistoryPoint
} from "@/components/portfolio-history-chart";
import { CardSkeleton, TableSkeleton } from "@/components/ui-skeletons";
import TopNav from "@/components/top-nav";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui-states";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getEasternDateString } from "@/lib/dates";
import { formatFlagAmount, formatTwoDecimals } from "@/lib/format";

type ProfileRow = {
  username: string;
  email: string;
  role: "user" | "admin";
};

type WalletRow = {
  liquid_flags: number;
};

type OpinionRow = {
  body: string;
  created_at: string;
};

type WinnerRow = {
  winner_date: string;
  rank: number;
  reward_flags: number;
  votes_received: number;
  opinion_id: string;
  opinion_body: string | null;
};

type HoldingRawRow = {
  player_id: string;
  units: number;
  avg_cost_basis: number;
};

type PlayerLookupRow = {
  id: string;
  name: string;
  current_price: number;
};

type HoldingViewRow = {
  player_id: string;
  player_name: string;
  units: number;
  avg_cost_basis: number;
  current_price: number;
  cost_basis_value: number;
  market_value: number;
  unrealized_pnl: number;
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

type DashboardData = {
  profile: ProfileRow | null;
  wallet: WalletRow | null;
  todayOpinion: OpinionRow | null;
  assignmentsCount: number;
  votesCount: number;
  latestWinner: WinnerRow | null;
  holdings: HoldingViewRow[];
  portfolioHistory: PortfolioHistoryPoint[];
  followState: FollowStateRow | null;
  followers: FollowListRow[];
  following: FollowListRow[];
};

type PortfolioHistoryRawRow = {
  result_snap_date: string;
  result_unplanted_flags_close: number;
  result_planted_value_close: number;
  result_total_value_close: number;
  result_holdings_json: unknown;
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

export default function DashboardPage() {
  return (
    <main>
      <TopNav />
      <h1>User Profile</h1>
      <RequireAuth>{(session) => <DashboardPanel userId={session.user.id} />}</RequireAuth>
    </main>
  );
}

function DashboardPanel({ userId }: { userId: string }) {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<DashboardData>({
    profile: null,
    wallet: null,
    todayOpinion: null,
    assignmentsCount: 0,
    votesCount: 0,
    latestWinner: null,
    holdings: [],
    portfolioHistory: [],
    followState: null,
    followers: [],
    following: []
  });
  const [activeConnectionList, setActiveConnectionList] = useState<
    "followers" | "following" | "none"
  >("none");
  const dashboardDate = useMemo(() => getEasternDateString(), []);

  const loadDashboard = useCallback(async () => {
    setBusy(true);
    setError("");

    const profileQuery = supabase
      .from("profiles")
      .select("username,email,role")
      .eq("id", userId)
      .single();
    const walletQuery = supabase
      .from("wallets")
      .select("liquid_flags")
      .eq("user_id", userId)
      .single();
    const opinionQuery = supabase
      .from("opinions")
      .select("body,created_at")
      .eq("user_id", userId)
      .eq("submitted_for_date", dashboardDate)
      .maybeSingle();
    const assignmentsQuery = supabase
      .from("opinion_assignments")
      .select("id", { count: "exact", head: true })
      .eq("viewer_user_id", userId)
      .eq("assigned_for_date", dashboardDate);
    const votesQuery = supabase
      .from("opinion_votes")
      .select("id", { count: "exact", head: true })
      .eq("voter_user_id", userId)
      .eq("assigned_for_date", dashboardDate);
    const latestWinnerQuery = supabase
      .from("daily_winners")
      .select("winner_date,rank,reward_flags,votes_received,opinion_id")
      .eq("user_id", userId)
      .order("winner_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    const holdingsQuery = supabase
      .from("holdings")
      .select("player_id,units,avg_cost_basis")
      .eq("user_id", userId)
      .gt("units", 0.005);
    const portfolioHistoryQuery = supabase.rpc("get_user_portfolio_history", {
      target_user_id: userId,
      lookback_days: 30
    });
    const followStateQuery = supabase.rpc("get_follow_state", {
      target_user_id: userId
    });
    const followersQuery = supabase.rpc("get_follow_list", {
      target_user_id: userId,
      list_kind: "followers",
      limit_count: 20
    });
    const followingQuery = supabase.rpc("get_follow_list", {
      target_user_id: userId,
      list_kind: "following",
      limit_count: 20
    });

    const [
      profileResult,
      walletResult,
      opinionResult,
      assignmentsResult,
      votesResult,
      latestWinnerResult,
      holdingsResult,
      portfolioHistoryResult,
      followStateResult,
      followersResult,
      followingResult
    ] = await Promise.all([
      profileQuery,
      walletQuery,
      opinionQuery,
      assignmentsQuery,
      votesQuery,
      latestWinnerQuery,
      holdingsQuery,
      portfolioHistoryQuery,
      followStateQuery,
      followersQuery,
      followingQuery
    ]);

    if (profileResult.error) {
      setError(profileResult.error.message);
      setBusy(false);
      setLoading(false);
      return;
    }
    if (walletResult.error) {
      setError(walletResult.error.message);
      setBusy(false);
      setLoading(false);
      return;
    }
    if (opinionResult.error) {
      setError(opinionResult.error.message);
      setBusy(false);
      setLoading(false);
      return;
    }
    if (assignmentsResult.error) {
      setError(assignmentsResult.error.message);
      setBusy(false);
      setLoading(false);
      return;
    }
    if (votesResult.error) {
      setError(votesResult.error.message);
      setBusy(false);
      setLoading(false);
      return;
    }
    if (latestWinnerResult.error) {
      setError(latestWinnerResult.error.message);
      setBusy(false);
      setLoading(false);
      return;
    }
    if (holdingsResult.error) {
      setError(holdingsResult.error.message);
      setBusy(false);
      setLoading(false);
      return;
    }
    if (portfolioHistoryResult.error) {
      setError(portfolioHistoryResult.error.message);
      setBusy(false);
      setLoading(false);
      return;
    }
    if (followStateResult.error) {
      setError(followStateResult.error.message);
      setBusy(false);
      setLoading(false);
      return;
    }
    if (followersResult.error) {
      setError(followersResult.error.message);
      setBusy(false);
      setLoading(false);
      return;
    }
    if (followingResult.error) {
      setError(followingResult.error.message);
      setBusy(false);
      setLoading(false);
      return;
    }

    const holdingsRaw = (holdingsResult.data ?? []) as HoldingRawRow[];
    const playerIds = holdingsRaw.map((row) => row.player_id);
    let playerMap = new Map<string, PlayerLookupRow>();

    if (playerIds.length > 0) {
      const { data: playersData, error: playersError } = await supabase
        .from("players")
        .select("id,name,current_price")
        .in("id", playerIds);

      if (playersError) {
        setError(playersError.message);
        setBusy(false);
        setLoading(false);
        return;
      }

      playerMap = new Map(
        ((playersData ?? []) as PlayerLookupRow[]).map((row) => [row.id, row])
      );
    }

    const holdings = holdingsRaw
      .map((row) => {
        const player = playerMap.get(row.player_id);
        if (!player) return null;
        return {
          player_id: row.player_id,
          player_name: player.name,
          units: row.units,
          avg_cost_basis: row.avg_cost_basis,
          current_price: player.current_price,
          cost_basis_value: row.units * row.avg_cost_basis,
          market_value: row.units * player.current_price,
          unrealized_pnl: row.units * (player.current_price - row.avg_cost_basis)
        } as HoldingViewRow;
      })
      .filter((row): row is HoldingViewRow => row !== null);

    const historyRows = (portfolioHistoryResult.data ?? []) as PortfolioHistoryRawRow[];
    const portfolioHistory = historyRows.map((row) => ({
      snap_date: row.result_snap_date,
      unplanted_close: row.result_unplanted_flags_close ?? 0,
      planted_close: row.result_planted_value_close ?? 0,
      total_close: row.result_total_value_close ?? 0,
      holdings: parseHistoryHoldings(row.result_holdings_json)
    }));
    const followStateRows = (followStateResult.data ?? []) as FollowStateRow[];
    const followState = followStateRows[0] ?? null;
    const followers = (followersResult.data ?? []) as FollowListRow[];
    const following = (followingResult.data ?? []) as FollowListRow[];

    const latestWinnerRaw = (latestWinnerResult.data as Omit<
      WinnerRow,
      "opinion_body"
    > | null) ?? null;
    let latestWinner: WinnerRow | null = latestWinnerRaw
      ? {
          ...latestWinnerRaw,
          opinion_body: null
        }
      : null;

    if (latestWinnerRaw?.opinion_id) {
      const { data: opinionBodyData } = await supabase
        .from("opinions")
        .select("body")
        .eq("id", latestWinnerRaw.opinion_id)
        .maybeSingle();
      if (
        opinionBodyData &&
        typeof (opinionBodyData as { body?: unknown }).body === "string"
      ) {
        latestWinner = {
          ...latestWinnerRaw,
          opinion_body: (opinionBodyData as { body: string }).body
        };
      }
    }

    setData({
      profile: (profileResult.data as ProfileRow | null) ?? null,
      wallet: (walletResult.data as WalletRow | null) ?? null,
      todayOpinion: (opinionResult.data as OpinionRow | null) ?? null,
      assignmentsCount: assignmentsResult.count ?? 0,
      votesCount: votesResult.count ?? 0,
      latestWinner,
      holdings,
      portfolioHistory,
      followState,
      followers,
      following
    });

    setBusy(false);
    setLoading(false);
  }, [dashboardDate, supabase, userId]);

  useEffect(() => {
    loadDashboard().catch((loadError: unknown) => {
      const message =
        loadError instanceof Error ? loadError.message : "Unknown dashboard error";
      setError(message);
      setLoading(false);
      setBusy(false);
    });
  }, [loadDashboard]);

  const totalHoldingsMarketValue = data.holdings.reduce(
    (sum, holding) => sum + holding.market_value,
    0
  );
  const totalHoldingsCostBasis = data.holdings.reduce(
    (sum, holding) => sum + holding.cost_basis_value,
    0
  );
  const totalUnrealizedPnl = totalHoldingsMarketValue - totalHoldingsCostBasis;
  const totalUnrealizedPnlPct =
    totalHoldingsCostBasis > 0
      ? (totalUnrealizedPnl / totalHoldingsCostBasis) * 100
      : null;
  const totalNetWorth =
    data.wallet?.liquid_flags === undefined
      ? null
      : data.wallet.liquid_flags + totalHoldingsMarketValue;
  const unplantedSharePct =
    totalNetWorth !== null && totalNetWorth > 0 && data.wallet
      ? (data.wallet.liquid_flags / totalNetWorth) * 100
      : null;
  const plantedSharePct =
    totalNetWorth !== null && totalNetWorth > 0
      ? (totalHoldingsMarketValue / totalNetWorth) * 100
      : null;
  const topHolding = data.holdings.reduce<HoldingViewRow | null>(
    (best, holding) => {
      if (!best) return holding;
      return holding.market_value > best.market_value ? holding : best;
    },
    null
  );
  const activeConnectionRows =
    activeConnectionList === "followers"
      ? data.followers
      : activeConnectionList === "following"
        ? data.following
        : [];

  return (
    <div className="grid">
      {loading ? (
        <div className="grid">
          <LoadingState message="Loading dashboard..." variant="card" />
          <div className="dashboard-columns">
            <div className="dashboard-column dashboard-column-left">
              <CardSkeleton />
              <CardSkeleton />
            </div>
            <div className="dashboard-column dashboard-column-right">
              <CardSkeleton />
              <div className="card">
                <TableSkeleton columns={6} rows={4} />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {error ? <ErrorState message={error} variant="card" /> : null}

      {!loading && !error ? (
        <>
          <div className="card">
            <div className="account-header">
              <h2>{data.profile?.username ?? "User Profile"}</h2>
              <div className="account-actions">
                <button type="button" onClick={() => router.push(`/profiles/${userId}`)}>
                  Public Profile
                </button>
                {data.profile?.role === "admin" ? (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => router.push("/admin")}
                  >
                    Admin Mode
                  </button>
                ) : null}
              </div>
            </div>
            <div className="split-metrics">
              <div>
                <p className="muted">Followers</p>
                <button
                  type="button"
                  onClick={() =>
                    setActiveConnectionList((current) =>
                      current === "followers" ? "none" : "followers"
                    )
                  }
                >
                  {data.followState?.result_follower_count ?? 0}
                </button>
              </div>
              <div>
                <p className="muted">Following</p>
                <button
                  type="button"
                  onClick={() =>
                    setActiveConnectionList((current) =>
                      current === "following" ? "none" : "following"
                    )
                  }
                >
                  {data.followState?.result_following_count ?? 0}
                </button>
              </div>
            </div>
            {activeConnectionList !== "none" ? (
              <>
                <p>
                  <strong>
                    {activeConnectionList === "followers" ? "Followers" : "Following"}
                  </strong>
                </p>
                {activeConnectionRows.length === 0 ? (
                  <EmptyState message="No users in this list yet." />
                ) : (
                  <ul>
                    {activeConnectionRows.map((row) => (
                      <li key={`${activeConnectionList}-${row.result_user_id}`}>
                        <Link href={`/profiles/${row.result_user_id}`}>
                          {row.result_username}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : null}
          </div>

          <div className="dashboard-columns">
            <div className="dashboard-column dashboard-column-left">
              <div className="card">
                <p className="dashboard-section-label">Ball Knowledge</p>
              </div>

              <div className="card">
                <h2>Opinion Status</h2>
                {data.todayOpinion ? (
                  <>
                    <p className="success">Submitted for today.</p>
                    <p>{data.todayOpinion.body}</p>
                  </>
                ) : (
                  <p className="muted">Not submitted for today yet.</p>
                )}
              </div>

              <div className="card">
                <h2>Voting Status</h2>
                <p>Assignments: {data.assignmentsCount}</p>
                <p>Votes cast: {data.votesCount}</p>
                <p>
                  Completion:{" "}
                  {data.assignmentsCount > 0
                    ? `${data.votesCount}/${data.assignmentsCount}`
                    : "0/0"}
                </p>
              </div>

              <div className="card">
                <h2>Latest Winner Result</h2>
                {data.latestWinner ? (
                  <>
                    <p>Date: {data.latestWinner.winner_date}</p>
                    <p>Rank: {data.latestWinner.rank}</p>
                    <p>Votes: {data.latestWinner.votes_received}</p>
                    <p>
                      Reward flags: {formatFlagAmount(data.latestWinner.reward_flags)}
                    </p>
                    <p>Winning opinion:</p>
                    <p>{data.latestWinner.opinion_body ?? "--"}</p>
                  </>
                ) : (
                  <EmptyState message="No winner result yet for this account." />
                )}
              </div>
            </div>

            <div className="dashboard-column dashboard-column-right">
              <div className="card">
                <p className="dashboard-section-label">Flag Market</p>
              </div>

              <div className="card">
                <h2>Wallet</h2>
                <p>
                  Unplanted flags:{" "}
                  <strong>{formatFlagAmount(data.wallet?.liquid_flags)}</strong>
                </p>
                <p>
                  FlagPlants value:{" "}
                  <strong>{formatFlagAmount(totalHoldingsMarketValue)}</strong>
                </p>
                <p>
                  Total net worth: <strong>{formatFlagAmount(totalNetWorth)}</strong>
                </p>
              </div>

              <div className="card">
                <h2>FlagPlants</h2>
                {data.holdings.length === 0 ? (
                  <EmptyState message="No FlagPlants yet." />
                ) : (
                  <table className="dashboard-holdings-table">
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
                      {data.holdings.map((holding) => (
                        <tr key={holding.player_id}>
                          <td>
                            <Link href={`/players/${holding.player_id}`}>
                              {holding.player_name}
                            </Link>
                          </td>
                          <td>{formatTwoDecimals(holding.units)}</td>
                          <td>{formatFlagAmount(holding.avg_cost_basis)}</td>
                          <td>{formatFlagAmount(holding.current_price)}</td>
                          <td>{formatFlagAmount(holding.cost_basis_value)}</td>
                          <td>{formatFlagAmount(holding.market_value)}</td>
                          <td>{formatSignedFlag(holding.unrealized_pnl)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="card">
                <h2>Portfolio Metrics</h2>
                <p>
                  FlagPlants cost basis:{" "}
                  <strong>{formatFlagAmount(totalHoldingsCostBasis)}</strong>
                </p>
                <p>
                  Unrealized P/L:{" "}
                  <strong>{formatSignedFlag(totalUnrealizedPnl)}</strong>
                </p>
                <p>
                  Unrealized return:{" "}
                  <strong>
                    {totalUnrealizedPnlPct === null
                      ? "--"
                      : `${formatTwoDecimals(totalUnrealizedPnlPct)}%`}
                  </strong>
                </p>
                <p>
                  Allocation (Unplanted / Planted):{" "}
                  <strong>
                    {unplantedSharePct === null || plantedSharePct === null
                      ? "--"
                      : `${formatTwoDecimals(unplantedSharePct)}% / ${formatTwoDecimals(plantedSharePct)}%`}
                  </strong>
                </p>
                <p>
                  Top FlagPlant by value:{" "}
                  <strong>
                    {topHolding
                      ? `${topHolding.player_name} (${formatFlagAmount(topHolding.market_value)})`
                      : "--"}
                  </strong>
                </p>
                <PortfolioHistoryChart points={data.portfolioHistory} />
              </div>
            </div>
          </div>

          <div className="card">
            <h2>Today</h2>
            <p className="muted">App date (ET): {dashboardDate}</p>
            <button type="button" onClick={loadDashboard} disabled={busy}>
              {busy ? "Refreshing..." : "Refresh dashboard"}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
