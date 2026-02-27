"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import RequireAuth from "@/components/require-auth";
import { formatFlagAmount, formatTwoDecimals } from "@/lib/format";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type OrderRow = {
  id: string;
  player_id: string;
  order_type: "buy" | "sell";
  status: "pending" | "executed" | "cancelled" | "failed";
  flags_amount: number | null;
  units_amount: number | null;
  trade_date: string;
  created_at: string;
};

type PlayerLookupRow = {
  id: string;
  name: string;
};

type OrderViewRow = OrderRow & {
  player_name: string;
};

export default function OrdersPage() {
  return (
    <main>
      <h1>My Orders</h1>
      <p>
        <Link href="/">Back to Home</Link>
      </p>
      <p>
        <Link href="/dashboard">Go to Dashboard</Link>
      </p>
      <p>
        <Link href="/players">Go to Players</Link>
      </p>
      <RequireAuth>{(session) => <OrdersPanel userId={session.user.id} />}</RequireAuth>
    </main>
  );
}

function OrdersPanel({ userId }: { userId: string }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [orders, setOrders] = useState<OrderViewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadOrders = useCallback(async () => {
    setBusy(true);
    setError("");

    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .select(
        "id,player_id,order_type,status,flags_amount,units_amount,trade_date,created_at"
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (orderError) {
      setError(orderError.message);
      setOrders([]);
      setLoading(false);
      setBusy(false);
      return;
    }

    const rawOrders = (orderData ?? []) as OrderRow[];
    const playerIds = [...new Set(rawOrders.map((row) => row.player_id))];
    let playerMap = new Map<string, string>();

    if (playerIds.length > 0) {
      const { data: playerData, error: playerError } = await supabase
        .from("players")
        .select("id,name")
        .in("id", playerIds);

      if (playerError) {
        setError(playerError.message);
        setOrders([]);
        setLoading(false);
        setBusy(false);
        return;
      }

      playerMap = new Map(
        ((playerData ?? []) as PlayerLookupRow[]).map((row) => [row.id, row.name])
      );
    }

    const viewRows = rawOrders.map((row) => ({
      ...row,
      player_name: playerMap.get(row.player_id) ?? row.player_id
    }));

    setOrders(viewRows);
    setLoading(false);
    setBusy(false);
  }, [supabase, userId]);

  useEffect(() => {
    loadOrders().catch((loadError: unknown) => {
      const msg = loadError instanceof Error ? loadError.message : "Unknown load error";
      setError(msg);
      setLoading(false);
      setBusy(false);
    });
  }, [loadOrders]);

  return (
    <div className="card">
      <button type="button" onClick={loadOrders} disabled={busy}>
        {busy ? "Refreshing..." : "Refresh Orders"}
      </button>

      {loading ? <p>Loading orders...</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {!loading && !error && orders.length === 0 ? (
        <p className="muted">No orders yet.</p>
      ) : null}

      {!loading && !error && orders.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>Created</th>
              <th>Trade Date</th>
              <th>Player</th>
              <th>Type</th>
              <th>Status</th>
              <th>Flags</th>
              <th>Units</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td>{new Date(order.created_at).toLocaleString()}</td>
                <td>{order.trade_date}</td>
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
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
