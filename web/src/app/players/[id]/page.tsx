"use client";

import { useParams, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import PlayerPriceHistoryChart, {
  type PlayerPriceHistoryPoint
} from "@/components/player-price-history-chart";
import RequireAuth from "@/components/require-auth";
import TopNav from "@/components/top-nav";
import { formatEasternDateTime, getEasternDateString } from "@/lib/dates";
import { formatFlagAmount, formatTwoDecimals } from "@/lib/format";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type PlayerRow = {
  id: string;
  name: string;
  active: boolean;
  seed_price: number;
  current_price: number;
  baseline_capital: number;
};

type WalletRow = {
  liquid_flags: number;
};

type PendingBuySumRow = {
  flags_amount: number | null;
};

type PendingSellSumRow = {
  flags_amount: number | null;
  units_amount: number | null;
};

type HoldingRow = {
  units: number;
  avg_cost_basis: number;
};

type PlayerMarketStatsRow = {
  result_player_id: string;
  result_holder_count: number;
  result_invested_capital: number;
};

type OrderRow = {
  id: string;
  order_type: "buy" | "sell";
  status: "pending" | "executed" | "cancelled" | "failed";
  flags_amount: number | null;
  units_amount: number | null;
  trade_date: string;
  created_at: string;
  executed_at: string | null;
};

type PlayerPriceHistoryRawRow = {
  result_snap_date: string;
  result_close_price: number;
  result_day_change: number;
  result_day_change_pct: number;
};

export default function PlayerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const playerId = useMemo(() => params?.id ?? "", [params]);

  function onBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/flag-market");
  }

  return (
    <main>
      <TopNav />
      <button type="button" onClick={onBack}>
        Back
      </button>
      <RequireAuth>
        {(session) => <PlayerDetailPanel userId={session.user.id} playerId={playerId} />}
      </RequireAuth>
    </main>
  );
}

function PlayerDetailPanel({ userId, playerId }: { userId: string; playerId: string }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [player, setPlayer] = useState<PlayerRow | null>(null);
  const [marketStats, setMarketStats] = useState({
    holderCount: 0,
    investedCapital: 0
  });
  const [wallet, setWallet] = useState<WalletRow | null>(null);
  const [pendingBuyFlags, setPendingBuyFlags] = useState(0);
  const [pendingBuyFlagsAll, setPendingBuyFlagsAll] = useState(0);
  const [pendingSellFlags, setPendingSellFlags] = useState(0);
  const [pendingSellUnits, setPendingSellUnits] = useState(0);
  const [holding, setHolding] = useState<HoldingRow | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [priceHistory, setPriceHistory] = useState<PlayerPriceHistoryPoint[]>([]);
  const [buyAmount, setBuyAmount] = useState("");
  const [sellAmount, setSellAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [cancelMessage, setCancelMessage] = useState("");
  const [cancelError, setCancelError] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    if (!playerId) {
      setError("Missing player id in route.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    const playerQuery = supabase
      .from("players")
      .select("id,name,active,seed_price,current_price,baseline_capital")
      .eq("id", playerId)
      .single();
    const walletQuery = supabase
      .from("wallets")
      .select("liquid_flags")
      .eq("user_id", userId)
      .single();
    const holdingQuery = supabase
      .from("holdings")
      .select("units,avg_cost_basis")
      .eq("user_id", userId)
      .eq("player_id", playerId)
      .maybeSingle();
    const pendingBuySumQuery = supabase
      .from("orders")
      .select("flags_amount")
      .eq("user_id", userId)
      .eq("order_type", "buy")
      .eq("status", "pending");
    const pendingBuySumPlayerQuery = supabase
      .from("orders")
      .select("flags_amount")
      .eq("user_id", userId)
      .eq("player_id", playerId)
      .eq("order_type", "buy")
      .eq("status", "pending");
    const pendingSellSumQuery = supabase
      .from("orders")
      .select("flags_amount,units_amount")
      .eq("user_id", userId)
      .eq("player_id", playerId)
      .eq("order_type", "sell")
      .eq("status", "pending");
    const ordersQuery = supabase
      .from("orders")
      .select("id,order_type,status,flags_amount,units_amount,trade_date,created_at,executed_at")
      .eq("user_id", userId)
      .eq("player_id", playerId)
      .order("executed_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(20);
    const priceHistoryQuery = supabase.rpc("get_player_price_history", {
      target_player_id: playerId,
      lookback_days: null
    });
    const marketStatsQuery = supabase.rpc("get_player_market_stats");

    const [
      playerResult,
      walletResult,
      holdingResult,
      pendingBuySumResult,
      pendingBuySumPlayerResult,
      pendingSellSumResult,
      ordersResult,
      priceHistoryResult,
      marketStatsResult
    ] = await Promise.all([
      playerQuery,
      walletQuery,
      holdingQuery,
      pendingBuySumQuery,
      pendingBuySumPlayerQuery,
      pendingSellSumQuery,
      ordersQuery,
      priceHistoryQuery,
      marketStatsQuery
    ]);

    if (playerResult.error) {
      setError(playerResult.error.message);
      setLoading(false);
      return;
    }
    if (walletResult.error) {
      setError(walletResult.error.message);
      setLoading(false);
      return;
    }
    if (holdingResult.error) {
      setError(holdingResult.error.message);
      setLoading(false);
      return;
    }
    if (pendingBuySumResult.error) {
      setError(pendingBuySumResult.error.message);
      setLoading(false);
      return;
    }
    if (pendingSellSumResult.error) {
      setError(pendingSellSumResult.error.message);
      setLoading(false);
      return;
    }
    if (pendingBuySumPlayerResult.error) {
      setError(pendingBuySumPlayerResult.error.message);
      setLoading(false);
      return;
    }
    if (ordersResult.error) {
      setError(ordersResult.error.message);
      setLoading(false);
      return;
    }
    if (priceHistoryResult.error) {
      setError(priceHistoryResult.error.message);
      setLoading(false);
      return;
    }

    setPlayer((playerResult.data as PlayerRow | null) ?? null);
    setWallet((walletResult.data as WalletRow | null) ?? null);
    setHolding((holdingResult.data as HoldingRow | null) ?? null);
    const pendingBuyRows = (pendingBuySumResult.data ?? []) as PendingBuySumRow[];
    const pendingBuyTotal = pendingBuyRows.reduce(
      (sum, row) => sum + (row.flags_amount ?? 0),
      0
    );
    setPendingBuyFlagsAll(pendingBuyTotal);
    const pendingBuyPlayerRows = (pendingBuySumPlayerResult.data ?? []) as PendingBuySumRow[];
    const pendingBuyPlayerTotal = pendingBuyPlayerRows.reduce(
      (sum, row) => sum + (row.flags_amount ?? 0),
      0
    );
    setPendingBuyFlags(pendingBuyPlayerTotal);
    const pendingSellRows = (pendingSellSumResult.data ?? []) as PendingSellSumRow[];
    const pendingSellUnitsTotal = pendingSellRows.reduce(
      (sum, row) => sum + (row.units_amount ?? 0),
      0
    );
    const pendingSellFlagsTotal = pendingSellRows.reduce(
      (sum, row) =>
        sum +
        (row.flags_amount ??
          ((row.units_amount ?? 0) * ((playerResult.data as PlayerRow | null)?.current_price ?? 0))),
      0
    );
    setPendingSellUnits(pendingSellUnitsTotal);
    setPendingSellFlags(pendingSellFlagsTotal);
    setOrders((ordersResult.data ?? []) as OrderRow[]);
    const historyRows = (priceHistoryResult.data ?? []) as PlayerPriceHistoryRawRow[];
    setPriceHistory(
      historyRows.map((row) => ({
        snap_date: row.result_snap_date,
        close_price: row.result_close_price ?? 0,
        day_change: row.result_day_change ?? 0,
        day_change_pct: row.result_day_change_pct ?? 0
      }))
    );
    const marketStatsRows = marketStatsResult.error
      ? []
      : ((marketStatsResult.data ?? []) as PlayerMarketStatsRow[]);
    const playerMarketStats = marketStatsRows.find(
      (row) => row.result_player_id === playerId
    );
    setMarketStats({
      holderCount: playerMarketStats?.result_holder_count ?? 0,
      investedCapital: playerMarketStats?.result_invested_capital ?? 0
    });
    setLoading(false);
  }, [playerId, supabase, userId]);

  useEffect(() => {
    loadData().catch((loadError: unknown) => {
      const msg = loadError instanceof Error ? loadError.message : "Unknown load error";
      setError(msg);
      setLoading(false);
    });
  }, [loadData]);

  async function submitBuyOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    if (!player) {
      setError("Player not loaded.");
      setBusy(false);
      return;
    }

    const parsed = Number.parseFloat(buyAmount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Enter a valid buy amount greater than 0.");
      setBusy(false);
      return;
    }

    const availableForNewBuys = wallet
      ? Math.max(wallet.liquid_flags - pendingBuyFlagsAll, 0)
      : 0;
    if (parsed > availableForNewBuys) {
      setError(
        `Buy amount exceeds available flags for new buy orders (${formatFlagAmount(availableForNewBuys)}).`
      );
      setBusy(false);
      return;
    }

    const { error: insertError } = await supabase.from("orders").insert({
      user_id: userId,
      player_id: player.id,
      order_type: "buy",
      flags_amount: parsed,
      trade_date: getEasternDateString()
    });

    if (insertError) {
      setError(insertError.message);
      setBusy(false);
      return;
    }

    setMessage("Buy order created with status 'pending'.");
    setBuyAmount("");
    await loadData();
    setBusy(false);
  }

  async function submitSellOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    if (!player) {
      setError("Player not loaded.");
      setBusy(false);
      return;
    }

    const parsedFlags = Number.parseFloat(sellAmount);
    if (!Number.isFinite(parsedFlags) || parsedFlags <= 0) {
      setError("Enter a valid sell flags amount greater than 0.");
      setBusy(false);
      return;
    }

    if (!player.current_price || player.current_price <= 0) {
      setError("Current player price is not valid.");
      setBusy(false);
      return;
    }

    const estimatedUnits = parsedFlags / player.current_price;
    const availableUnitsForSell = Math.max((holding?.units ?? 0) - pendingSellUnits, 0);
    if (estimatedUnits > availableUnitsForSell) {
      setError(
        `Sell units exceed available units for new sell orders (${formatTwoDecimals(availableUnitsForSell)}).`
      );
      setBusy(false);
      return;
    }

    const { error: insertError } = await supabase.from("orders").insert({
      user_id: userId,
      player_id: player.id,
      order_type: "sell",
      flags_amount: parsedFlags,
      units_amount: estimatedUnits,
      trade_date: getEasternDateString()
    });

    if (insertError) {
      setError(insertError.message);
      setBusy(false);
      return;
    }

    setMessage(
      `Sell order created with status 'pending' (estimated units: ${formatTwoDecimals(estimatedUnits)}).`
    );
    setSellAmount("");
    await loadData();
    setBusy(false);
  }

  async function cancelPendingOrder(orderId: string) {
    setCancellingOrderId(orderId);
    setCancelError("");
    setCancelMessage("");

    const { data, error: cancelRpcError } = await supabase.rpc("cancel_pending_order", {
      target_order_id: orderId
    });

    if (cancelRpcError) {
      setCancelError(cancelRpcError.message);
      setCancellingOrderId(null);
      return;
    }

    const row = ((data ?? []) as { result_deleted?: boolean }[])[0];
    if (!row?.result_deleted) {
      setCancelError("Order could not be cancelled. It may already be processed.");
      setCancellingOrderId(null);
      await loadData();
      return;
    }

    setCancelMessage("Pending order cancelled.");
    await loadData();
    setCancellingOrderId(null);
  }

  if (loading) {
    return (
      <div className="card">
        <p>Loading player detail...</p>
      </div>
    );
  }

  if (error && !player) {
    return (
      <div className="card">
        <p className="error">{error}</p>
      </div>
    );
  }

  const positionValueFlags = (holding?.units ?? 0) * (player?.current_price ?? 0);
  const availableSellFlags = Math.max(positionValueFlags - pendingSellFlags, 0);

  return (
    <>
      <h1>{player?.name ?? "Player"}</h1>
      <div className="grid">
      <div className="card">
        <h2>Your Position</h2>
        <p>Position Value (Flags): {formatFlagAmount(positionValueFlags)}</p>
        <p>Units Held: {holding ? formatTwoDecimals(holding.units) : "0.00"}</p>
        <p>
          Avg. Cost Basis:{" "}
          {holding ? formatFlagAmount(holding.avg_cost_basis) : formatFlagAmount(0)}
        </p>
        <p>Pending Buy Flags: {formatFlagAmount(pendingBuyFlags)}</p>
        <p>Pending Sell Flags: {formatFlagAmount(pendingSellFlags)}</p>
      </div>

      <div className="two-col-cards">
        <div className="card">
          <div className="order-card-header">
            <h2>Place Buy Order</h2>
            <button type="button" className="order-card-badge" disabled>
              Unplanted Flags: {formatFlagAmount(wallet?.liquid_flags)}
            </button>
          </div>
          <p className="muted">
            Creates a pending buy order. Admin order-clearing executes it at the current
            market price.
          </p>
          <form className="grid order-form-gap" onSubmit={submitBuyOrder}>
            <label>
              Flags Amount
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={buyAmount}
                onChange={(e) => setBuyAmount(e.target.value)}
                required
              />
            </label>
            <button type="submit" disabled={busy}>
              {busy ? "Submitting..." : "Create Buy Order"}
            </button>
          </form>
          <p className="muted">
            Estimated Units At Current Price:{" "}
            {formatTwoDecimals(
              (Number.parseFloat(buyAmount || "0") || 0) / (player?.current_price || 1)
            )}
          </p>
          {message ? <p className="success">{message}</p> : null}
          {error ? <p className="error">{error}</p> : null}
        </div>

        <div className="card">
          <div className="order-card-header">
            <h2>Place Sell Order</h2>
            <button type="button" className="order-card-badge" disabled>
              Available To Sell: {formatFlagAmount(availableSellFlags)}
            </button>
          </div>
          <p className="muted">
            Creates a pending sell order. Admin order-clearing executes it at the current market price.
          </p>
          <form className="grid order-form-gap" onSubmit={submitSellOrder}>
            <label>
              Flags Amount
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={sellAmount}
                onChange={(e) => setSellAmount(e.target.value)}
                required
              />
            </label>
            <button type="submit" disabled={busy}>
              {busy ? "Submitting..." : "Create Sell Order"}
            </button>
          </form>
          <p className="muted">
            Estimated Units At Current Price:{" "}
            {formatTwoDecimals(
              (Number.parseFloat(sellAmount || "0") || 0) / (player?.current_price || 1)
            )}
          </p>
          {message ? <p className="success">{message}</p> : null}
          {error ? <p className="error">{error}</p> : null}
        </div>
      </div>

      <div className="card">
        <h2>Historical Price Movement</h2>
        <PlayerPriceHistoryChart points={priceHistory} />
      </div>

      <div className="card">
        <h2>Recent Orders</h2>
        {cancelMessage ? <p className="success">{cancelMessage}</p> : null}
        {cancelError ? <p className="error">{cancelError}</p> : null}
        {orders.length === 0 ? (
          <p className="muted">No orders yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Created</th>
                <th>Processed</th>
                <th>Type</th>
                <th>Status</th>
                <th>Flags</th>
                <th>Units</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>{formatEasternDateTime(order.created_at)}</td>
                  <td>
                    {order.executed_at ? formatEasternDateTime(order.executed_at) : "--"}
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
                    {order.status === "pending" ? (
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
                    ) : (
                      "--"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>{player?.name ?? "Player"}</h2>
        <p>Active: {player?.active ? "Yes" : "No"}</p>
        <p>Seed Price: {formatFlagAmount(player?.seed_price)}</p>
        <p>Current Price: {formatFlagAmount(player?.current_price)}</p>
        <p>Baseline Capital: {formatFlagAmount(player?.baseline_capital)}</p>
        <p>Holders: {marketStats.holderCount}</p>
        <p>Planted Capital: {formatFlagAmount(marketStats.investedCapital)}</p>
      </div>
      </div>
    </>
  );
}
