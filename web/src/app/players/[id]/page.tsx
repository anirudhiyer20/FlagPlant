"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import RequireAuth from "@/components/require-auth";
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
};

function todayString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function PlayerDetailPage() {
  const params = useParams<{ id: string }>();
  const playerId = useMemo(() => params?.id ?? "", [params]);

  return (
    <main>
      <h1>Player Detail</h1>
      <p>
        <Link href="/players">Back to Players</Link>
      </p>
      <p>
        <Link href="/dashboard">Go to Dashboard</Link>
      </p>
      <p>
        <Link href="/orders">Go to My Orders</Link>
      </p>
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
  const [holding, setHolding] = useState<HoldingRow | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [buyAmount, setBuyAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
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
    const ordersQuery = supabase
      .from("orders")
      .select("id,order_type,status,flags_amount,units_amount,trade_date,created_at")
      .eq("user_id", userId)
      .eq("player_id", playerId)
      .order("created_at", { ascending: false })
      .limit(20);
    const marketStatsQuery = supabase.rpc("get_player_market_stats");

    const [
      playerResult,
      walletResult,
      holdingResult,
      pendingBuySumResult,
      ordersResult,
      marketStatsResult
    ] = await Promise.all([
      playerQuery,
      walletQuery,
      holdingQuery,
      pendingBuySumQuery,
      ordersQuery,
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
    if (ordersResult.error) {
      setError(ordersResult.error.message);
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
    setPendingBuyFlags(pendingBuyTotal);
    setOrders((ordersResult.data ?? []) as OrderRow[]);
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
      ? Math.max(wallet.liquid_flags - pendingBuyFlags, 0)
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
      trade_date: todayString()
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

  return (
    <div className="grid">
      <div className="card">
        <h2>{player?.name ?? "Player"}</h2>
        <p>Active: {player?.active ? "Yes" : "No"}</p>
        <p>Seed price: {formatFlagAmount(player?.seed_price)}</p>
        <p>Current price: {formatFlagAmount(player?.current_price)}</p>
        <p>Baseline capital: {formatFlagAmount(player?.baseline_capital)}</p>
        <p>Holders: {marketStats.holderCount}</p>
        <p>Invested capital: {formatFlagAmount(marketStats.investedCapital)}</p>
      </div>

      <div className="card">
        <h2>Your Position</h2>
        <p>Liquid flags: {formatFlagAmount(wallet?.liquid_flags)}</p>
        <p>Pending buy flags: {formatFlagAmount(pendingBuyFlags)}</p>
        <p>
          Available for new buy orders:{" "}
          {formatFlagAmount(
            wallet ? Math.max(wallet.liquid_flags - pendingBuyFlags, 0) : 0
          )}
        </p>
        <p>Units held: {holding ? formatTwoDecimals(holding.units) : "0.00"}</p>
        <p>
          Avg cost basis:{" "}
          {holding ? formatFlagAmount(holding.avg_cost_basis) : formatFlagAmount(0)}
        </p>
      </div>

      <div className="card">
        <h2>Place Buy Order</h2>
        <p className="muted">
          Current implementation creates pending orders only. Matching/execution
          will be added in a later phase.
        </p>
        <form className="grid" onSubmit={submitBuyOrder}>
          <label>
            Flags amount
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
        {message ? <p className="success">{message}</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </div>

      <div className="card">
        <h2>Your Recent Orders For This Player</h2>
        {orders.length === 0 ? (
          <p className="muted">No orders yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Status</th>
                <th>Flags</th>
                <th>Units</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>{order.trade_date}</td>
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
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
