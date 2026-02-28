"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import RequireAuth from "@/components/require-auth";
import { getEasternDateString } from "@/lib/dates";
import { formatFlagAmount, formatTwoDecimals } from "@/lib/format";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type WinnerRow = {
  rank: number;
  user_id: string;
  username?: string;
  opinion_id: string;
  votes_received: number;
  reward_flags: number;
};

type PublishedRow = {
  rank: number;
  user_id: string;
  opinion_id: string;
  votes_received: number;
  reward_flags: number;
};

type RoleRow = {
  role: "user" | "admin";
};

type PendingOrderSummaryRow = {
  user_id: string;
  username: string;
  pending_order_count: number;
  pending_flags_total: number;
};

type PendingSellSummaryRow = {
  user_id: string;
  username: string;
  pending_order_count: number;
  pending_units_total: number;
  estimated_flags_total: number;
};

type OrderExecutionRow = {
  order_id: string;
  user_id: string;
  player_id: string;
  status: "pending" | "executed" | "cancelled" | "failed";
  flags_amount: number | null;
  units_amount: number | null;
  note: string;
};

type PendingOrderSummaryRawRow = {
  result_user_id?: string;
  result_username?: string;
  result_pending_order_count?: number;
  result_pending_flags_total?: number;
  result_pending_units_total?: number;
  result_estimated_flags_total?: number;
  user_id?: string;
  username?: string;
  pending_order_count?: number;
  pending_flags_total?: number;
  pending_units_total?: number;
  estimated_flags_total?: number;
};

type OrderExecutionRawRow = {
  result_order_id?: string;
  result_user_id?: string;
  result_player_id?: string;
  result_status?: "pending" | "executed" | "cancelled" | "failed";
  result_flags_amount?: number | null;
  result_units_amount?: number | null;
  result_note?: string;
  order_id?: string;
  user_id?: string;
  player_id?: string;
  status?: "pending" | "executed" | "cancelled" | "failed";
  flags_amount?: number | null;
  units_amount?: number | null;
  note?: string;
};

type RepricingRow = {
  result_player_id: string;
  result_player_name: string;
  result_pre_price: number;
  result_post_price: number;
  result_net_flow_flags: number;
  result_total_units: number;
  result_effective_capital: number;
  result_price_multiplier: number;
};

type DailyCloseStepRow = {
  result_step: string;
  result_status: string;
  result_detail: string;
  result_count: number;
};

type DailyCloseStepRawRow = {
  result_step?: string;
  result_status?: string;
  result_detail?: string;
  result_count?: number;
  step?: string;
  status?: string;
  detail?: string;
  count?: number;
};

export default function AdminPage() {
  return (
    <main>
      <h1>Admin</h1>
      <p>
        <Link href="/">Back to Home</Link>
      </p>
      <p>
        <Link href="/dashboard">Go to Dashboard</Link>
      </p>
      <p>
        <Link href="/vote">Go to Vote</Link>
      </p>
      <p>
        <Link href="/orders">Go to My Orders</Link>
      </p>
      <RequireAuth>{(session) => <AdminPanel userId={session.user.id} />}</RequireAuth>
    </main>
  );
}

function AdminPanel({ userId }: { userId: string }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [selectedDate, setSelectedDate] = useState(getEasternDateString());
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loadingRole, setLoadingRole] = useState(true);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [executingOrders, setExecutingOrders] = useState(false);
  const [executingSellOrders, setExecutingSellOrders] = useState(false);
  const [repricingBusy, setRepricingBusy] = useState(false);
  const [dailyCloseBusy, setDailyCloseBusy] = useState(false);
  const [previewRows, setPreviewRows] = useState<WinnerRow[]>([]);
  const [publishedRows, setPublishedRows] = useState<PublishedRow[]>([]);
  const [pendingOrderSummaryRows, setPendingOrderSummaryRows] = useState<
    PendingOrderSummaryRow[]
  >([]);
  const [pendingSellSummaryRows, setPendingSellSummaryRows] = useState<
    PendingSellSummaryRow[]
  >([]);
  const [buyExecutionRows, setBuyExecutionRows] = useState<OrderExecutionRow[]>([]);
  const [sellExecutionRows, setSellExecutionRows] = useState<OrderExecutionRow[]>([]);
  const [repricingRows, setRepricingRows] = useState<RepricingRow[]>([]);
  const [dailyCloseRows, setDailyCloseRows] = useState<DailyCloseStepRow[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadRole() {
      setLoadingRole(true);
      const { data, error: roleError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .single();

      if (roleError) {
        setError(roleError.message);
        setIsAdmin(false);
        setLoadingRole(false);
        return;
      }

      const role = (data as RoleRow).role;
      setIsAdmin(role === "admin");
      setLoadingRole(false);
    }

    loadRole().catch((loadError: unknown) => {
      const msg = loadError instanceof Error ? loadError.message : "Unknown role load error";
      setError(msg);
      setLoadingRole(false);
    });
  }, [supabase, userId]);

  async function loadPublishedForDate() {
    const { data, error: publishedError } = await supabase
      .from("daily_winners")
      .select("rank,user_id,opinion_id,votes_received,reward_flags")
      .eq("winner_date", selectedDate)
      .order("rank", { ascending: true });

    if (publishedError) {
      setError(publishedError.message);
      setPublishedRows([]);
      return;
    }

    setPublishedRows((data ?? []) as PublishedRow[]);
  }

  async function runDailyClose() {
    setDailyCloseBusy(true);
    setMessage("");
    setError("");

    const { data, error: closeError } = await supabase.rpc("admin_run_daily_close", {
      target_date: selectedDate
    });

    if (closeError) {
      setError(closeError.message);
      setDailyCloseRows([]);
      setDailyCloseBusy(false);
      return;
    }

    const mapped = ((data ?? []) as DailyCloseStepRawRow[]).map((row) => ({
      result_step: row.result_step ?? row.step ?? "",
      result_status: row.result_status ?? row.status ?? "",
      result_detail: row.result_detail ?? row.detail ?? "",
      result_count: row.result_count ?? row.count ?? 0
    }));

    setDailyCloseRows(mapped);
    setMessage("Daily close pipeline completed.");
    await loadPublishedForDate();
    await loadPendingBuySummary();
    await loadPendingSellSummary();
    setDailyCloseBusy(false);
  }

  async function loadPreview() {
    setLoading(true);
    setMessage("");
    setError("");

    const { data, error: previewError } = await supabase.rpc(
      "get_daily_winner_preview",
      { target_date: selectedDate }
    );

    if (previewError) {
      setError(previewError.message);
      setPreviewRows([]);
      setLoading(false);
      return;
    }

    setPreviewRows((data ?? []) as WinnerRow[]);
    await loadPublishedForDate();
    setLoading(false);
  }

  async function loadPendingBuySummary() {
    const { data, error: summaryError } = await supabase.rpc(
      "admin_preview_pending_buy_orders",
      { target_date: selectedDate }
    );

    if (summaryError) {
      setError(summaryError.message);
      setPendingOrderSummaryRows([]);
      return;
    }

    const mapped = ((data ?? []) as PendingOrderSummaryRawRow[])
      .map((row) => ({
        user_id: row.result_user_id ?? row.user_id ?? "",
        username: row.result_username ?? row.username ?? "",
        pending_order_count:
          row.result_pending_order_count ?? row.pending_order_count ?? 0,
        pending_flags_total:
          row.result_pending_flags_total ?? row.pending_flags_total ?? 0
      }))
      .filter((row) => row.user_id.length > 0);

    setPendingOrderSummaryRows(mapped);
  }

  async function executePendingBuyOrders() {
    setExecutingOrders(true);
    setMessage("");
    setError("");

    const { data, error: executeError } = await supabase.rpc(
      "admin_execute_pending_buy_orders",
      { target_date: selectedDate }
    );

    if (executeError) {
      setError(executeError.message);
      setExecutingOrders(false);
      await loadPendingBuySummary();
      return;
    }

    const rows = ((data ?? []) as OrderExecutionRawRow[]).map((row) => ({
      order_id: row.result_order_id ?? row.order_id ?? "",
      user_id: row.result_user_id ?? row.user_id ?? "",
      player_id: row.result_player_id ?? row.player_id ?? "",
      status: row.result_status ?? row.status ?? "failed",
      flags_amount:
        row.result_flags_amount !== undefined
          ? row.result_flags_amount
          : (row.flags_amount ?? null),
      units_amount:
        row.result_units_amount !== undefined
          ? row.result_units_amount
          : (row.units_amount ?? null),
      note: row.result_note ?? row.note ?? ""
    }));
    setBuyExecutionRows(rows);
    const executedCount = rows.filter((row) => row.status === "executed").length;
    const failedCount = rows.filter((row) => row.status === "failed").length;
    setMessage(
      `Buy order execution complete. Executed: ${executedCount}. Failed: ${failedCount}.`
    );
    await loadPendingBuySummary();
    setExecutingOrders(false);
  }

  async function loadPendingSellSummary() {
    const { data, error: summaryError } = await supabase.rpc(
      "admin_preview_pending_sell_orders",
      { target_date: selectedDate }
    );

    if (summaryError) {
      setError(summaryError.message);
      setPendingSellSummaryRows([]);
      return;
    }

    const mapped = ((data ?? []) as PendingOrderSummaryRawRow[])
      .map((row) => ({
        user_id: row.result_user_id ?? row.user_id ?? "",
        username: row.result_username ?? row.username ?? "",
        pending_order_count:
          row.result_pending_order_count ?? row.pending_order_count ?? 0,
        pending_units_total:
          row.result_pending_units_total ?? row.pending_units_total ?? 0,
        estimated_flags_total:
          row.result_estimated_flags_total ?? row.estimated_flags_total ?? 0
      }))
      .filter((row) => row.user_id.length > 0);

    setPendingSellSummaryRows(mapped);
  }

  async function executePendingSellOrders() {
    setExecutingSellOrders(true);
    setMessage("");
    setError("");

    const { data, error: executeError } = await supabase.rpc(
      "admin_execute_pending_sell_orders",
      { target_date: selectedDate }
    );

    if (executeError) {
      setError(executeError.message);
      setExecutingSellOrders(false);
      await loadPendingSellSummary();
      return;
    }

    const rows = ((data ?? []) as OrderExecutionRawRow[]).map((row) => ({
      order_id: row.result_order_id ?? row.order_id ?? "",
      user_id: row.result_user_id ?? row.user_id ?? "",
      player_id: row.result_player_id ?? row.player_id ?? "",
      status: row.result_status ?? row.status ?? "failed",
      flags_amount:
        row.result_flags_amount !== undefined
          ? row.result_flags_amount
          : (row.flags_amount ?? null),
      units_amount:
        row.result_units_amount !== undefined
          ? row.result_units_amount
          : (row.units_amount ?? null),
      note: row.result_note ?? row.note ?? ""
    }));
    setSellExecutionRows(rows);
    const executedCount = rows.filter((row) => row.status === "executed").length;
    const failedCount = rows.filter((row) => row.status === "failed").length;
    setMessage(
      `Sell order execution complete. Executed: ${executedCount}. Failed: ${failedCount}.`
    );
    await loadPendingSellSummary();
    setExecutingSellOrders(false);
  }

  async function previewRepricing() {
    setRepricingBusy(true);
    setMessage("");
    setError("");

    const { data, error: repricingError } = await supabase.rpc(
      "admin_preview_player_repricing",
      { target_date: selectedDate }
    );

    if (repricingError) {
      setError(repricingError.message);
      setRepricingRows([]);
      setRepricingBusy(false);
      return;
    }

    setRepricingRows((data ?? []) as RepricingRow[]);
    setRepricingBusy(false);
  }

  async function applyRepricing() {
    setRepricingBusy(true);
    setMessage("");
    setError("");

    const { data, error: repricingError } = await supabase.rpc(
      "admin_apply_player_repricing",
      { target_date: selectedDate }
    );

    if (repricingError) {
      setError(repricingError.message);
      setRepricingBusy(false);
      return;
    }

    const rows = (data ?? []) as RepricingRow[];
    setRepricingRows(rows);
    setMessage("Applied repricing and wrote daily player snapshots.");
    setRepricingBusy(false);
  }

  async function publishWinners() {
    setPublishing(true);
    setMessage("");
    setError("");

    const { data, error: publishError } = await supabase.rpc(
      "admin_publish_daily_winners",
      { target_date: selectedDate }
    );

    if (publishError) {
      setError(publishError.message);
      setPublishing(false);
      await loadPublishedForDate();
      return;
    }

    setMessage("Published winners and applied wallet rewards.");
    setPreviewRows((data ?? []) as WinnerRow[]);
    await loadPublishedForDate();
    setPublishing(false);
  }

  if (loadingRole) {
    return (
      <div className="card">
        <p>Checking admin access...</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="card">
        <h2>Not authorized</h2>
        <p className="muted">This page is only for admin users.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Daily Close Pipeline</h2>
      <div className="grid">
        <button
          type="button"
          className="secondary"
          onClick={runDailyClose}
          disabled={
            dailyCloseBusy ||
            loading ||
            publishing ||
            executingOrders ||
            executingSellOrders ||
            repricingBusy
          }
        >
          {dailyCloseBusy ? "Running..." : "Run Daily Close (All Steps)"}
        </button>
      </div>
      {dailyCloseRows.length === 0 ? (
        <p className="muted">No daily-close run yet for selected date.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Step</th>
              <th>Status</th>
              <th>Detail</th>
              <th>Count</th>
            </tr>
          </thead>
          <tbody>
            {dailyCloseRows.map((row, idx) => (
              <tr key={`${row.result_step}-${idx}`}>
                <td>{row.result_step}</td>
                <td>{row.result_status}</td>
                <td>{row.result_detail}</td>
                <td>{row.result_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Winner Tools</h2>
      <div className="grid">
        <label>
          Target vote/close date (ET)
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={loadPreview}
          disabled={loading || publishing || dailyCloseBusy}
        >
          {loading ? "Loading..." : "Preview Top 5"}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={publishWinners}
          disabled={
            publishing ||
            loading ||
            executingOrders ||
            executingSellOrders ||
            repricingBusy ||
            dailyCloseBusy
          }
        >
          {publishing ? "Publishing..." : "Publish Winners"}
        </button>
      </div>

      {message ? <p className="success">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      <h2>Preview</h2>
      {previewRows.length === 0 ? (
        <p className="muted">No preview rows loaded yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>User</th>
              <th>Votes</th>
              <th>Reward</th>
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row) => (
              <tr key={`${row.rank}-${row.opinion_id}`}>
                <td>{row.rank}</td>
                <td>{row.username ?? row.user_id}</td>
                <td>{row.votes_received}</td>
                <td>{formatFlagAmount(row.reward_flags)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Published For Date</h2>
      {publishedRows.length === 0 ? (
        <p className="muted">No published winners found for selected date.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>User ID</th>
              <th>Votes</th>
              <th>Reward</th>
            </tr>
          </thead>
          <tbody>
            {publishedRows.map((row) => (
              <tr key={`${row.rank}-${row.opinion_id}`}>
                <td>{row.rank}</td>
                <td>{row.user_id}</td>
                <td>{row.votes_received}</td>
                <td>{formatFlagAmount(row.reward_flags)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Order Clearing (Buy/Sell Orders)</h2>
      <div className="grid">
        <button
          type="button"
          onClick={loadPendingBuySummary}
          disabled={
            loading ||
            publishing ||
            executingOrders ||
            executingSellOrders ||
            repricingBusy ||
            dailyCloseBusy
          }
        >
          Preview Pending Buy Orders
        </button>
        <button
          type="button"
          className="secondary"
          onClick={executePendingBuyOrders}
          disabled={
            loading ||
            publishing ||
            executingOrders ||
            executingSellOrders ||
            repricingBusy ||
            dailyCloseBusy
          }
        >
          {executingOrders ? "Executing..." : "Execute Pending Buy Orders"}
        </button>
      </div>

      {pendingOrderSummaryRows.length === 0 ? (
        <p className="muted">No pending buy-order summary loaded for selected date.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Pending Orders</th>
              <th>Pending Flags</th>
            </tr>
          </thead>
          <tbody>
            {pendingOrderSummaryRows.map((row) => (
              <tr key={row.user_id}>
                <td>{row.username}</td>
                <td>{row.pending_order_count}</td>
                <td>{formatFlagAmount(row.pending_flags_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {buyExecutionRows.length > 0 ? (
        <>
          <h2>Latest Buy Execution Result</h2>
          <table>
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Status</th>
                <th>Flags</th>
                <th>Units</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {buyExecutionRows.map((row) => (
                <tr key={row.order_id}>
                  <td>{row.order_id}</td>
                  <td>{row.status}</td>
                  <td>
                    {row.flags_amount === null
                      ? "--"
                      : formatFlagAmount(row.flags_amount)}
                  </td>
                  <td>
                    {row.units_amount === null
                      ? "--"
                      : formatTwoDecimals(row.units_amount)}
                  </td>
                  <td>{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}

      <div className="grid">
        <button
          type="button"
          onClick={loadPendingSellSummary}
          disabled={
            loading ||
            publishing ||
            executingOrders ||
            executingSellOrders ||
            repricingBusy ||
            dailyCloseBusy
          }
        >
          Preview Pending Sell Orders
        </button>
        <button
          type="button"
          className="secondary"
          onClick={executePendingSellOrders}
          disabled={
            loading ||
            publishing ||
            executingOrders ||
            executingSellOrders ||
            repricingBusy ||
            dailyCloseBusy
          }
        >
          {executingSellOrders ? "Executing..." : "Execute Pending Sell Orders"}
        </button>
      </div>

      {pendingSellSummaryRows.length === 0 ? (
        <p className="muted">No pending sell-order summary loaded for selected date.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Pending Orders</th>
              <th>Pending Units</th>
              <th>Estimated Flags</th>
            </tr>
          </thead>
          <tbody>
            {pendingSellSummaryRows.map((row) => (
              <tr key={row.user_id}>
                <td>{row.username}</td>
                <td>{row.pending_order_count}</td>
                <td>{formatTwoDecimals(row.pending_units_total)}</td>
                <td>{formatFlagAmount(row.estimated_flags_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {sellExecutionRows.length > 0 ? (
        <>
          <h2>Latest Sell Execution Result</h2>
          <table>
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Status</th>
                <th>Flags</th>
                <th>Units</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {sellExecutionRows.map((row) => (
                <tr key={row.order_id}>
                  <td>{row.order_id}</td>
                  <td>{row.status}</td>
                  <td>
                    {row.flags_amount === null
                      ? "--"
                      : formatFlagAmount(row.flags_amount)}
                  </td>
                  <td>
                    {row.units_amount === null
                      ? "--"
                      : formatTwoDecimals(row.units_amount)}
                  </td>
                  <td>{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}

      <h2>Repricing</h2>
      <div className="grid">
        <button
          type="button"
          onClick={previewRepricing}
          disabled={
            loading ||
            publishing ||
            executingOrders ||
            executingSellOrders ||
            repricingBusy ||
            dailyCloseBusy
          }
        >
          {repricingBusy ? "Working..." : "Preview Repricing"}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={applyRepricing}
          disabled={
            loading ||
            publishing ||
            executingOrders ||
            executingSellOrders ||
            repricingBusy ||
            dailyCloseBusy
          }
        >
          {repricingBusy ? "Working..." : "Apply Repricing"}
        </button>
      </div>

      {repricingRows.length === 0 ? (
        <p className="muted">No repricing rows loaded for selected date.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Player</th>
              <th>Pre</th>
              <th>Post</th>
              <th>Net Flow</th>
              <th>Multiplier</th>
            </tr>
          </thead>
          <tbody>
            {repricingRows.map((row) => (
              <tr key={row.result_player_id}>
                <td>{row.result_player_name}</td>
                <td>{formatFlagAmount(row.result_pre_price)}</td>
                <td>{formatFlagAmount(row.result_post_price)}</td>
                <td>{formatFlagAmount(row.result_net_flow_flags)}</td>
                <td>{formatTwoDecimals(row.result_price_multiplier)}x</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
