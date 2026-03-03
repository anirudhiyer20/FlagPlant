"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import RequireAuth from "@/components/require-auth";
import TopNav from "@/components/top-nav";
import { CardSkeleton, TableSkeleton } from "@/components/ui-skeletons";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui-states";
import { formatEasternDateTime } from "@/lib/dates";
import { formatFlagAmount, formatTwoDecimals } from "@/lib/format";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type PlayerRow = {
  id: string;
  name: string;
  seed_price: number;
  current_price: number;
  holder_count: number;
  invested_capital: number;
};

type PlayerMarketStatsRow = {
  result_player_id: string;
  result_holder_count: number;
  result_invested_capital: number;
};

type OrderRow = {
  id: string;
  player_id: string;
  order_type: "buy" | "sell";
  status: "pending" | "executed" | "cancelled" | "failed";
  flags_amount: number | null;
  units_amount: number | null;
  trade_date: string;
  created_at: string;
  executed_at: string | null;
};

type PlayerLookupRow = {
  id: string;
  name: string;
};

type OrderViewRow = OrderRow & {
  player_name: string;
};

type TabKey = "available_players" | "my_orders";
type RecentOrderFilter = "executed" | "failed" | "cancelled" | "all";

const MONTH_SHORT_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec"
] as const;

function formatTradeDateMMMDD(tradeDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tradeDate);
  if (!match) return tradeDate;
  const monthIndex = Number(match[2]) - 1;
  const day = match[3];
  if (monthIndex < 0 || monthIndex > 11) return tradeDate;
  return `${MONTH_SHORT_NAMES[monthIndex]}-${day}`;
}

export default function FlagMarketPage() {
  return (
    <main>
      <TopNav />
      <h1>Flag Market</h1>
      <RequireAuth>{(session) => <FlagMarketPanel userId={session.user.id} />}</RequireAuth>
    </main>
  );
}

function FlagMarketPanel({ userId }: { userId: string }) {
  const [activeTab, setActiveTab] = useState<TabKey>("available_players");

  return (
    <div className="grid">
      <div className="card">
        <div className="split-metrics">
          <button
            type="button"
            onClick={() => setActiveTab("available_players")}
            className={activeTab === "available_players" ? "" : "secondary"}
          >
            Available Players
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("my_orders")}
            className={activeTab === "my_orders" ? "" : "secondary"}
          >
            My Orders
          </button>
        </div>
      </div>

      {activeTab === "available_players" ? <PlayersTable /> : null}
      {activeTab === "my_orders" ? <OrdersPanel userId={userId} /> : null}
    </div>
  );
}

function PlayersTable() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadPlayers = useCallback(async () => {
    setLoading(true);
    setError("");

    const playersQuery = supabase
      .from("players")
      .select("id,name,seed_price,current_price")
      .order("current_price", { ascending: false });
    const marketStatsQuery = supabase.rpc("get_player_market_stats");

    const [playersResult, marketStatsResult] = await Promise.all([
      playersQuery,
      marketStatsQuery
    ]);

    if (playersResult.error) {
      setError(playersResult.error.message);
      setLoading(false);
      return;
    }

    const playersData = (playersResult.data ?? []) as Omit<
      PlayerRow,
      "holder_count" | "invested_capital"
    >[];
    const marketStatsData = marketStatsResult.error
      ? []
      : ((marketStatsResult.data ?? []) as PlayerMarketStatsRow[]);
    const marketStatsByPlayerId = new Map(
      marketStatsData.map((row) => [row.result_player_id, row])
    );

    setPlayers(
      playersData.map((player) => ({
        ...player,
        holder_count: marketStatsByPlayerId.get(player.id)?.result_holder_count ?? 0,
        invested_capital:
          marketStatsByPlayerId.get(player.id)?.result_invested_capital ?? 0
      }))
    );
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadPlayers().catch((loadError: unknown) => {
      const msg = loadError instanceof Error ? loadError.message : "Unknown error";
      setError(msg);
      setLoading(false);
    });
  }, [loadPlayers]);

  const filteredPlayers = useMemo(() => {
    const normalized = searchQuery.trim().toLowerCase();
    if (normalized.length === 0) return players;
    return players.filter((player) => player.name.toLowerCase().includes(normalized));
  }, [players, searchQuery]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearchQuery(searchInput.trim());
  }

  return (
    <div className="card">
      <h2>Available Players</h2>
      <div className="players-controls-row">
        <form className="players-search-row" onSubmit={submitSearch}>
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search Players..."
            aria-label="Search Players"
          />
          <button type="submit" className="connections-search-button">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M15.5 14h-.79l-.28-.27a6 6 0 1 0-.71.71l.27.28v.79L20 21.5 21.5 20zM10 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10z"
                fill="currentColor"
              />
            </svg>
            Search
          </button>
        </form>
        <button type="button" onClick={loadPlayers} disabled={loading}>
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>
      {error ? <ErrorState message={error} /> : null}
      {loading ? <TableSkeleton columns={5} rows={8} /> : null}

      {!loading && !error ? (
        <>
          {filteredPlayers.length === 0 ? (
            <EmptyState
              message={
                searchQuery
                  ? `No Players Match "${searchQuery}".`
                  : "No Players Available."
              }
            />
          ) : (
            <div className="table-top-space">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Seed Price</th>
                    <th>Current Price</th>
                    <th>Holders</th>
                    <th>Planted Capital</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPlayers.map((player) => (
                    <tr key={player.id}>
                      <td>
                        <Link href={`/players/${player.id}`}>{player.name}</Link>
                      </td>
                      <td>{formatFlagAmount(player.seed_price)}</td>
                      <td>{formatFlagAmount(player.current_price)}</td>
                      <td>{player.holder_count}</td>
                      <td>{formatFlagAmount(player.invested_capital)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

function OrdersPanel({ userId }: { userId: string }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [pendingOrders, setPendingOrders] = useState<OrderViewRow[]>([]);
  const [recentOrders, setRecentOrders] = useState<OrderViewRow[]>([]);
  const [recentPage, setRecentPage] = useState(1);
  const [recentTotalCount, setRecentTotalCount] = useState(0);
  const [recentFilter, setRecentFilter] = useState<RecentOrderFilter>("executed");
  const [loading, setLoading] = useState(true);
  const [pendingBusy, setPendingBusy] = useState(false);
  const [recentBusy, setRecentBusy] = useState(false);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(recentTotalCount / pageSize));

  const enrichOrdersWithPlayerNames = useCallback(
    async (rawOrders: OrderRow[]) => {
      const playerIds = [...new Set(rawOrders.map((row) => row.player_id))];
      let playerMap = new Map<string, string>();

      if (playerIds.length > 0) {
        const { data: playerData, error: playerError } = await supabase
          .from("players")
          .select("id,name")
          .in("id", playerIds);

        if (playerError) {
          throw new Error(playerError.message);
        }

        playerMap = new Map(
          ((playerData ?? []) as PlayerLookupRow[]).map((row) => [row.id, row.name])
        );
      }

      return rawOrders.map((row) => ({
        ...row,
        player_name: playerMap.get(row.player_id) ?? row.player_id
      }));
    },
    [supabase]
  );

  const loadPendingOrders = useCallback(async () => {
    setPendingBusy(true);
    setError("");

    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .select(
        "id,player_id,order_type,status,flags_amount,units_amount,trade_date,created_at,executed_at"
      )
      .eq("user_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (orderError) {
      setError(orderError.message);
      setPendingOrders([]);
      setPendingBusy(false);
      return;
    }

    try {
      const rawOrders = (orderData ?? []) as OrderRow[];
      const viewRows = await enrichOrdersWithPlayerNames(rawOrders);
      setPendingOrders(viewRows);
    } catch (loadError) {
      const msg = loadError instanceof Error ? loadError.message : "Unknown load error";
      setError(msg);
      setPendingOrders([]);
    }

    setPendingBusy(false);
  }, [enrichOrdersWithPlayerNames, supabase, userId]);

  const loadRecentOrders = useCallback(
    async (page: number, filter: RecentOrderFilter = recentFilter) => {
      setRecentBusy(true);
      setError("");

      const clampedPage = Math.max(1, page);
      const from = (clampedPage - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from("orders")
        .select(
          "id,player_id,order_type,status,flags_amount,units_amount,trade_date,created_at,executed_at",
          { count: "exact" }
        )
        .eq("user_id", userId)
        .order("executed_at", { ascending: false })
        .order("created_at", { ascending: false })
        .range(from, to);

      if (filter === "all") {
        query = query.in("status", ["executed", "failed", "cancelled"]);
      } else {
        query = query.eq("status", filter);
      }

      const { data: orderData, error: orderError, count } = await query;

      if (orderError) {
        setError(orderError.message);
        setRecentOrders([]);
        setRecentBusy(false);
        return;
      }

      try {
        const rawOrders = (orderData ?? []) as OrderRow[];
        const viewRows = await enrichOrdersWithPlayerNames(rawOrders);
        setRecentOrders(viewRows);
        setRecentPage(clampedPage);
        setRecentTotalCount(count ?? 0);
      } catch (loadError) {
        const msg = loadError instanceof Error ? loadError.message : "Unknown load error";
        setError(msg);
        setRecentOrders([]);
      }

      setRecentBusy(false);
    },
    [enrichOrdersWithPlayerNames, recentFilter, supabase, userId]
  );

  const cancelPendingOrder = useCallback(
    async (orderId: string) => {
      setCancellingOrderId(orderId);
      setError("");
      setMessage("");

      const { data, error: cancelError } = await supabase.rpc("cancel_pending_order", {
        target_order_id: orderId
      });

      if (cancelError) {
        setError(cancelError.message);
        setCancellingOrderId(null);
        return;
      }

      const row = ((data ?? []) as { result_deleted?: boolean }[])[0];
      if (!row?.result_deleted) {
        setError("Order could not be cancelled. It may already be processed.");
        setCancellingOrderId(null);
        await loadPendingOrders();
        return;
      }

      setMessage("Pending order cancelled.");
      await Promise.all([
        loadPendingOrders(),
        loadRecentOrders(recentPage, recentFilter)
      ]);
      setCancellingOrderId(null);
    },
    [loadPendingOrders, loadRecentOrders, recentFilter, recentPage, supabase]
  );

  useEffect(() => {
    setLoading(true);
    Promise.all([loadPendingOrders(), loadRecentOrders(1, recentFilter)])
      .catch((loadError: unknown) => {
        const msg = loadError instanceof Error ? loadError.message : "Unknown load error";
        setError(msg);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [loadPendingOrders, loadRecentOrders, recentFilter]);

  function onRecentFilterChange(nextFilter: RecentOrderFilter) {
    setRecentFilter(nextFilter);
    setRecentPage(1);
  }

  return (
    <div className="grid">
      {loading ? (
        <>
          <LoadingState message="Loading orders..." />
          <CardSkeleton />
          <div className="card">
            <TableSkeleton columns={8} rows={6} />
          </div>
        </>
      ) : null}
      {message ? <p className="success">{message}</p> : null}
      {error ? <ErrorState message={error} /> : null}

      <div className="card">
        <h2>Pending Orders</h2>
        {!loading && !error && pendingOrders.length === 0 ? (
          <EmptyState message="No pending orders." />
        ) : null}

        {!loading && !error && pendingOrders.length > 0 ? (
          <table className="orders-pending-table">
            <colgroup>
              <col className="orders-pending-col-trade-date" />
              <col className="orders-pending-col-player" />
              <col className="orders-pending-col-type" />
              <col className="orders-pending-col-status" />
              <col className="orders-pending-col-flags" />
              <col className="orders-pending-col-units" />
              <col className="orders-pending-col-action" />
            </colgroup>
            <thead>
              <tr>
                <th>Trade Date</th>
                <th>Player</th>
                <th>Type</th>
                <th>Status</th>
                <th>Flags</th>
                <th>Units</th>
                <th className="orders-pending-col-action">Action</th>
              </tr>
            </thead>
            <tbody>
              {pendingOrders.map((order) => (
                <tr key={order.id}>
                  <td>{formatTradeDateMMMDD(order.trade_date)}</td>
                  <td>
                    <Link href={`/players/${order.player_id}`}>{order.player_name}</Link>
                  </td>
                  <td>{order.order_type}</td>
                  <td>{order.status}</td>
                  <td>
                    {order.flags_amount === null
                      ? "--"
                      : formatFlagAmount(order.flags_amount)}
                  </td>
                  <td>
                    {order.units_amount === null
                      ? "--"
                      : formatTwoDecimals(order.units_amount)}
                  </td>
                  <td className="orders-pending-col-action">
                    <button
                      type="button"
                      className="secondary"
                      disabled={cancellingOrderId === order.id}
                      onClick={() => {
                        void cancelPendingOrder(order.id);
                      }}
                    >
                      {cancellingOrderId === order.id ? "Cancelling..." : "Cancel"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>

      <div className="card">
        <h2>Recent Orders</h2>
        <div className="tab-row">
          <button
            type="button"
            onClick={() => onRecentFilterChange("executed")}
            className={recentFilter === "executed" ? "" : "secondary"}
            disabled={recentBusy}
          >
            Executed
          </button>
          <button
            type="button"
            onClick={() => onRecentFilterChange("failed")}
            className={recentFilter === "failed" ? "" : "secondary"}
            disabled={recentBusy}
          >
            Failed
          </button>
          <button
            type="button"
            onClick={() => onRecentFilterChange("cancelled")}
            className={recentFilter === "cancelled" ? "" : "secondary"}
            disabled={recentBusy}
          >
            Cancelled
          </button>
          <button
            type="button"
            onClick={() => onRecentFilterChange("all")}
            className={recentFilter === "all" ? "" : "secondary"}
            disabled={recentBusy}
          >
            All Processed
          </button>
        </div>

        {!loading && !error && recentOrders.length === 0 ? (
          <EmptyState message="No orders found for this filter." />
        ) : null}

        {!loading && !error && recentOrders.length > 0 ? (
          <>
            <div className="table-section-space">
              <table>
                <thead>
                  <tr>
                    <th>Trade Date</th>
                    <th>Player</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Flags</th>
                    <th>Units</th>
                    <th>Processed</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((order) => (
                    <tr key={order.id}>
                      <td>{formatTradeDateMMMDD(order.trade_date)}</td>
                      <td>
                        <Link href={`/players/${order.player_id}`}>{order.player_name}</Link>
                      </td>
                      <td>{order.order_type}</td>
                      <td>{order.status}</td>
                      <td>
                        {order.flags_amount === null
                          ? "--"
                          : formatFlagAmount(order.flags_amount)}
                      </td>
                      <td>
                        {order.units_amount === null
                          ? "--"
                          : formatTwoDecimals(order.units_amount)}
                      </td>
                      <td>
                        {order.executed_at
                          ? formatEasternDateTime(order.executed_at)
                          : formatEasternDateTime(order.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="tab-row table-top-space">
              <button
                type="button"
                className="secondary"
                onClick={() => loadRecentOrders(recentPage - 1)}
                disabled={recentBusy || recentPage <= 1}
              >
                Previous Page
              </button>
              <button
                type="button"
                onClick={() => loadRecentOrders(recentPage + 1)}
                disabled={recentBusy || recentPage >= totalPages}
              >
                Next Page
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
