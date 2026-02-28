"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import RequireAuth from "@/components/require-auth";
import TopNav from "@/components/top-nav";
import { formatEasternDateTime, getEasternDateString } from "@/lib/dates";
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

type AdminPlayerRow = {
  id: string;
  name: string;
  seed_price: number;
  current_price: number;
  updated_at: string;
};

type PriceOverrideResultRow = {
  result_player_id: string;
  result_player_name: string;
  result_previous_price: number;
  result_current_price: number;
  result_override_reason: string | null;
  result_updated_at: string;
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

type DailyCloseDiagnosticRow = {
  result_target_date: string;
  result_close_job_status: string;
  result_close_job_started_at: string | null;
  result_close_job_finished_at: string | null;
  result_close_job_error: string | null;
  result_publish_job_status: string;
  result_publish_job_started_at: string | null;
  result_publish_job_finished_at: string | null;
  result_publish_job_error: string | null;
  result_winners_count: number;
  result_portfolio_snapshots_count: number;
  result_holding_snapshots_count: number;
  result_pending_buy_orders_count: number;
  result_pending_sell_orders_count: number;
  result_failed_orders_count: number;
};

type DailyCloseDiagnosticRawRow = {
  result_target_date?: string;
  result_close_job_status?: string;
  result_close_job_started_at?: string | null;
  result_close_job_finished_at?: string | null;
  result_close_job_error?: string | null;
  result_publish_job_status?: string;
  result_publish_job_started_at?: string | null;
  result_publish_job_finished_at?: string | null;
  result_publish_job_error?: string | null;
  result_winners_count?: number;
  result_portfolio_snapshots_count?: number;
  result_holding_snapshots_count?: number;
  result_pending_buy_orders_count?: number;
  result_pending_sell_orders_count?: number;
  result_failed_orders_count?: number;
};

type SystemJobRow = {
  result_job_date: string;
  result_job_type: string;
  result_status: string;
  result_started_at: string | null;
  result_finished_at: string | null;
  result_error: string;
};

type SystemJobRawRow = {
  result_job_date?: string;
  result_job_type?: string;
  result_status?: string;
  result_started_at?: string | null;
  result_finished_at?: string | null;
  result_error?: string;
};

type OrderExecutionActivityRow = {
  result_trade_date: string;
  result_order_type: string;
  result_batch_started_at: string | null;
  result_batch_finished_at: string | null;
  result_total_orders: number;
  result_executed_orders: number;
  result_failed_orders: number;
};

type OrderExecutionActivityRawRow = {
  result_trade_date?: string;
  result_order_type?: string;
  result_batch_started_at?: string | null;
  result_batch_finished_at?: string | null;
  result_total_orders?: number;
  result_executed_orders?: number;
  result_failed_orders?: number;
};

export default function AdminPage() {
  const router = useRouter();

  function onBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/dashboard");
  }

  return (
    <main>
      <TopNav />
      <h1>Admin</h1>
      <button type="button" onClick={onBack}>
        Back
      </button>
      <RequireAuth>{(session) => <AdminPanel userId={session.user.id} />}</RequireAuth>
    </main>
  );
}

function getStatusClassName(status: string): "success" | "error" | "muted" {
  if (status === "success") return "success";
  if (status === "failed") return "error";
  return "muted";
}

function formatJobTypeLabel(jobType: string): string {
  if (!jobType) return "--";
  return jobType
    .split("_")
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatOrderTypeLabel(orderType: string): string {
  if (!orderType) return "--";
  return orderType.charAt(0).toUpperCase() + orderType.slice(1);
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
  const [overrideLoading, setOverrideLoading] = useState(false);
  const [overrideBusy, setOverrideBusy] = useState(false);
  const [previewRows, setPreviewRows] = useState<WinnerRow[]>([]);
  const [publishedRows, setPublishedRows] = useState<PublishedRow[]>([]);
  const [overridePlayers, setOverridePlayers] = useState<AdminPlayerRow[]>([]);
  const [selectedOverridePlayerId, setSelectedOverridePlayerId] = useState("");
  const [overridePrice, setOverridePrice] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideResult, setOverrideResult] = useState<PriceOverrideResultRow | null>(
    null
  );
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
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [diagnosticsError, setDiagnosticsError] = useState("");
  const [diagnosticsSummary, setDiagnosticsSummary] =
    useState<DailyCloseDiagnosticRow | null>(null);
  const [recentJobs, setRecentJobs] = useState<SystemJobRow[]>([]);
  const [recentOrderActivity, setRecentOrderActivity] = useState<
    OrderExecutionActivityRow[]
  >([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const selectedOverridePlayer = overridePlayers.find(
    (row) => row.id === selectedOverridePlayerId
  );

  const loadDiagnostics = useCallback(async () => {
    setDiagnosticsLoading(true);
    setDiagnosticsError("");

    const [summaryResponse, jobsResponse, initialOrderActivityResponse] = await Promise.all([
      supabase.rpc("admin_get_daily_close_diagnostics", { target_date: selectedDate }),
      supabase.rpc("admin_list_recent_system_jobs", { limit_rows: 12 }),
      supabase.rpc("admin_list_recent_order_execution_activity", { limit_rows: 12 })
    ]);
    let orderActivityResponse = initialOrderActivityResponse;
    const orderActivityFunctionMissing =
      orderActivityResponse.error?.message.includes(
        "public.admin_list_recent_order_execution_activity(limit_rows)"
      ) ?? false;
    if (orderActivityFunctionMissing) {
      orderActivityResponse = await supabase.rpc(
        "admin_list_recent_order_execution_activity"
      );
    }

    const summaryError = summaryResponse.error;
    const jobsError = jobsResponse.error;
    const orderActivityError = orderActivityResponse.error;
    const nextErrors: string[] = [];

    if (summaryError) {
      setDiagnosticsSummary(null);
      nextErrors.push(`Summary unavailable: ${summaryError.message}`);
    } else {
      const raw = ((summaryResponse.data ?? []) as DailyCloseDiagnosticRawRow[])[0];
      if (!raw) {
        setDiagnosticsSummary(null);
      } else {
        setDiagnosticsSummary({
          result_target_date: raw.result_target_date ?? selectedDate,
          result_close_job_status: raw.result_close_job_status ?? "not_run",
          result_close_job_started_at: raw.result_close_job_started_at ?? null,
          result_close_job_finished_at: raw.result_close_job_finished_at ?? null,
          result_close_job_error: raw.result_close_job_error ?? null,
          result_publish_job_status: raw.result_publish_job_status ?? "not_run",
          result_publish_job_started_at: raw.result_publish_job_started_at ?? null,
          result_publish_job_finished_at: raw.result_publish_job_finished_at ?? null,
          result_publish_job_error: raw.result_publish_job_error ?? null,
          result_winners_count: raw.result_winners_count ?? 0,
          result_portfolio_snapshots_count: raw.result_portfolio_snapshots_count ?? 0,
          result_holding_snapshots_count: raw.result_holding_snapshots_count ?? 0,
          result_pending_buy_orders_count: raw.result_pending_buy_orders_count ?? 0,
          result_pending_sell_orders_count: raw.result_pending_sell_orders_count ?? 0,
          result_failed_orders_count: raw.result_failed_orders_count ?? 0
        });
      }
    }

    if (jobsError) {
      setRecentJobs([]);
      nextErrors.push(`Job log unavailable: ${jobsError.message}`);
    } else {
      const mapped = ((jobsResponse.data ?? []) as SystemJobRawRow[]).map((row) => ({
        result_job_date: row.result_job_date ?? "",
        result_job_type: row.result_job_type ?? "",
        result_status: row.result_status ?? "queued",
        result_started_at: row.result_started_at ?? null,
        result_finished_at: row.result_finished_at ?? null,
        result_error: row.result_error ?? ""
      }));
      setRecentJobs(mapped);
    }

    if (orderActivityError) {
      setRecentOrderActivity([]);
      nextErrors.push(`Order activity unavailable: ${orderActivityError.message}`);
    } else {
      const mapped = ((orderActivityResponse.data ?? []) as OrderExecutionActivityRawRow[])
        .map((row) => ({
          result_trade_date: row.result_trade_date ?? "",
          result_order_type: row.result_order_type ?? "",
          result_batch_started_at: row.result_batch_started_at ?? null,
          result_batch_finished_at: row.result_batch_finished_at ?? null,
          result_total_orders: row.result_total_orders ?? 0,
          result_executed_orders: row.result_executed_orders ?? 0,
          result_failed_orders: row.result_failed_orders ?? 0
        }))
        .filter((row) => row.result_trade_date.length > 0);
      setRecentOrderActivity(mapped);
    }

    setDiagnosticsError(nextErrors.join(" "));
    setDiagnosticsLoading(false);
  }, [selectedDate, supabase]);

  const loadManualOverridePlayers = useCallback(async () => {
    setOverrideLoading(true);

    const { data, error: playersError } = await supabase
      .from("players")
      .select("id,name,seed_price,current_price,updated_at")
      .order("name", { ascending: true });

    if (playersError) {
      setError(playersError.message);
      setOverridePlayers([]);
      setOverrideLoading(false);
      return;
    }

    const rows = (data ?? []) as AdminPlayerRow[];
    setOverridePlayers(rows);
    let autoSelectedPlayer: AdminPlayerRow | null = null;

    setSelectedOverridePlayerId((current) => {
      const hasCurrent = current.length > 0 && rows.some((row) => row.id === current);
      const nextPlayerId = hasCurrent ? current : (rows[0]?.id ?? "");
      if (!hasCurrent && nextPlayerId) {
        autoSelectedPlayer = rows.find((row) => row.id === nextPlayerId) ?? null;
      }
      return nextPlayerId;
    });

    if (autoSelectedPlayer) {
      setOverridePrice(String(autoSelectedPlayer.current_price));
    }

    setOverrideLoading(false);
  }, [supabase]);

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
      if (role === "admin") {
        await loadManualOverridePlayers();
      }
      setLoadingRole(false);
    }

    loadRole().catch((loadError: unknown) => {
      const msg = loadError instanceof Error ? loadError.message : "Unknown role load error";
      setError(msg);
      setLoadingRole(false);
    });
  }, [loadManualOverridePlayers, supabase, userId]);

  useEffect(() => {
    if (!isAdmin) return;

    loadDiagnostics().catch((loadError: unknown) => {
      const msg =
        loadError instanceof Error ? loadError.message : "Unknown diagnostics load error";
      setDiagnosticsError(`Diagnostics unavailable: ${msg}`);
      setDiagnosticsLoading(false);
    });
  }, [isAdmin, loadDiagnostics]);

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
    await loadDiagnostics();
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
    await loadDiagnostics();
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
    await loadDiagnostics();
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
    await loadDiagnostics();
    setRepricingBusy(false);
  }

  async function applyManualPriceOverride() {
    setOverrideBusy(true);
    setMessage("");
    setError("");

    if (!selectedOverridePlayerId) {
      setError("Select a player to override.");
      setOverrideBusy(false);
      return;
    }

    const parsedPrice = Number.parseFloat(overridePrice);
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setError("Enter a valid override price greater than 0.");
      setOverrideBusy(false);
      return;
    }

    const normalizedReason = overrideReason.trim();
    const { data, error: overrideError } = await supabase.rpc(
      "admin_override_player_price",
      {
        target_player_id: selectedOverridePlayerId,
        override_price: parsedPrice,
        override_reason: normalizedReason.length > 0 ? normalizedReason : null
      }
    );

    if (overrideError) {
      setError(overrideError.message);
      setOverrideBusy(false);
      return;
    }

    const row = ((data ?? []) as PriceOverrideResultRow[])[0] ?? null;
    if (!row) {
      setError("Override completed but no result row returned.");
      setOverrideBusy(false);
      return;
    }

    setOverrideResult(row);
    setMessage(
      `Manual override applied: ${row.result_player_name} ${formatFlagAmount(row.result_previous_price)} -> ${formatFlagAmount(row.result_current_price)}.`
    );
    setOverrideReason("");
    await loadManualOverridePlayers();
    setOverrideBusy(false);
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
    await loadDiagnostics();
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
    <div className="grid">
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

      </div>

      <div className="card">
      <h2>Diagnostics</h2>
      <p className="muted">
        Selected-date health checks plus recent job and order-execution activity.
      </p>
      <div className="grid">
        <button
          type="button"
          onClick={loadDiagnostics}
          disabled={
            diagnosticsLoading ||
            loading ||
            publishing ||
            executingOrders ||
            executingSellOrders ||
            repricingBusy ||
            dailyCloseBusy ||
            overrideBusy
          }
        >
          {diagnosticsLoading ? "Refreshing..." : "Refresh Diagnostics"}
        </button>
      </div>

      {diagnosticsError ? <p className="error">{diagnosticsError}</p> : null}

      {diagnosticsSummary ? (
        <>
          <h3>Selected Date Health ({diagnosticsSummary.result_target_date})</h3>
          <table>
            <thead>
              <tr>
                <th>Check</th>
                <th>Value</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Close Job</td>
                <td className={getStatusClassName(diagnosticsSummary.result_close_job_status)}>
                  {diagnosticsSummary.result_close_job_status}
                </td>
                <td>
                  Started:{" "}
                  {diagnosticsSummary.result_close_job_started_at
                    ? formatEasternDateTime(diagnosticsSummary.result_close_job_started_at)
                    : "--"}
                  {" | "}
                  Finished:{" "}
                  {diagnosticsSummary.result_close_job_finished_at
                    ? formatEasternDateTime(diagnosticsSummary.result_close_job_finished_at)
                    : "--"}
                  {diagnosticsSummary.result_close_job_error
                    ? ` | Error: ${diagnosticsSummary.result_close_job_error}`
                    : ""}
                </td>
              </tr>
              <tr>
                <td>Publish Job</td>
                <td className={getStatusClassName(diagnosticsSummary.result_publish_job_status)}>
                  {diagnosticsSummary.result_publish_job_status}
                </td>
                <td>
                  Started:{" "}
                  {diagnosticsSummary.result_publish_job_started_at
                    ? formatEasternDateTime(diagnosticsSummary.result_publish_job_started_at)
                    : "--"}
                  {" | "}
                  Finished:{" "}
                  {diagnosticsSummary.result_publish_job_finished_at
                    ? formatEasternDateTime(diagnosticsSummary.result_publish_job_finished_at)
                    : "--"}
                  {diagnosticsSummary.result_publish_job_error
                    ? ` | Error: ${diagnosticsSummary.result_publish_job_error}`
                    : ""}
                </td>
              </tr>
              <tr>
                <td>Published Winners</td>
                <td>{diagnosticsSummary.result_winners_count}</td>
                <td>Rows in `daily_winners` for selected date.</td>
              </tr>
              <tr>
                <td>Portfolio Snapshots</td>
                <td>{diagnosticsSummary.result_portfolio_snapshots_count}</td>
                <td>Rows in `daily_user_portfolio_snapshots`.</td>
              </tr>
              <tr>
                <td>Holding Snapshots</td>
                <td>{diagnosticsSummary.result_holding_snapshots_count}</td>
                <td>Rows in `daily_user_holding_snapshots`.</td>
              </tr>
              <tr>
                <td>Pending Buy Orders</td>
                <td>{diagnosticsSummary.result_pending_buy_orders_count}</td>
                <td>Open buy orders still awaiting admin execution.</td>
              </tr>
              <tr>
                <td>Pending Sell Orders</td>
                <td>{diagnosticsSummary.result_pending_sell_orders_count}</td>
                <td>Open sell orders still awaiting admin execution.</td>
              </tr>
              <tr>
                <td>Failed Orders</td>
                <td>{diagnosticsSummary.result_failed_orders_count}</td>
                <td>Orders marked `failed` for selected trade date.</td>
              </tr>
            </tbody>
          </table>
        </>
      ) : (
        <p className="muted">No diagnostics loaded yet for selected date.</p>
      )}

      <h3>Recent System Jobs</h3>
      {recentJobs.length === 0 ? (
        <p className="muted">No recent system jobs returned.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Job</th>
              <th>Status</th>
              <th>Started</th>
              <th>Finished</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {recentJobs.map((row, idx) => (
              <tr key={`${row.result_job_date}-${row.result_job_type}-${idx}`}>
                <td>{row.result_job_date || "--"}</td>
                <td>{formatJobTypeLabel(row.result_job_type)}</td>
                <td className={getStatusClassName(row.result_status)}>{row.result_status}</td>
                <td>
                  {row.result_started_at ? formatEasternDateTime(row.result_started_at) : "--"}
                </td>
                <td>
                  {row.result_finished_at
                    ? formatEasternDateTime(row.result_finished_at)
                    : "--"}
                </td>
                <td>{row.result_error || "--"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3>Recent Order Execution Activity</h3>
      {recentOrderActivity.length === 0 ? (
        <p className="muted">No recent order execution activity returned.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Trade Date</th>
              <th>Order Type</th>
              <th>Batch Start</th>
              <th>Batch End</th>
              <th>Total</th>
              <th>Executed</th>
              <th>Failed</th>
            </tr>
          </thead>
          <tbody>
            {recentOrderActivity.map((row, idx) => (
              <tr
                key={`${row.result_trade_date}-${row.result_order_type}-${row.result_batch_finished_at ?? "none"}-${idx}`}
              >
                <td>{row.result_trade_date || "--"}</td>
                <td>{formatOrderTypeLabel(row.result_order_type)}</td>
                <td>
                  {row.result_batch_started_at
                    ? formatEasternDateTime(row.result_batch_started_at)
                    : "--"}
                </td>
                <td>
                  {row.result_batch_finished_at
                    ? formatEasternDateTime(row.result_batch_finished_at)
                    : "--"}
                </td>
                <td>{row.result_total_orders}</td>
                <td>{row.result_executed_orders}</td>
                <td>{row.result_failed_orders}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      </div>

      <div className="card">
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

      </div>

      <div className="card">
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

      </div>

      <div className="card">
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

      </div>

      <div className="card">
      <h2>Order Clearing: Buy Orders</h2>
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

      </div>

      <div className="card">
      <h2>Order Clearing: Sell Orders</h2>
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

      </div>

      <div className="card">
      <h2>Manual Price Override</h2>
      <p className="muted">
        Admin-only emergency control. This updates a player&apos;s current price
        immediately.
      </p>
      <div className="grid">
        <button
          type="button"
          onClick={loadManualOverridePlayers}
          disabled={
            loading ||
            publishing ||
            executingOrders ||
            executingSellOrders ||
            repricingBusy ||
            dailyCloseBusy ||
            overrideBusy ||
            overrideLoading
          }
        >
          {overrideLoading ? "Loading players..." : "Refresh Players For Override"}
        </button>
        {overridePlayers.length === 0 ? (
          <p className="muted">No players loaded yet.</p>
        ) : (
          <>
            <label>
              Player
              <select
                value={selectedOverridePlayerId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setSelectedOverridePlayerId(nextId);
                  const nextPlayer =
                    overridePlayers.find((row) => row.id === nextId) ?? null;
                  if (nextPlayer) {
                    setOverridePrice(String(nextPlayer.current_price));
                  }
                }}
                disabled={overrideBusy || overrideLoading}
              >
                {overridePlayers.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="muted">
              Current price:{" "}
              {selectedOverridePlayer
                ? formatFlagAmount(selectedOverridePlayer.current_price)
                : "--"}{" "}
              | Seed price:{" "}
              {selectedOverridePlayer
                ? formatFlagAmount(selectedOverridePlayer.seed_price)
                : "--"}
            </p>
            <p className="muted">
              Last updated:{" "}
              {selectedOverridePlayer?.updated_at
                ? formatEasternDateTime(selectedOverridePlayer.updated_at)
                : "--"}
            </p>
            <label>
              Override Price
              <input
                type="number"
                min="0.000001"
                step="0.000001"
                value={overridePrice}
                onChange={(e) => setOverridePrice(e.target.value)}
                disabled={overrideBusy || overrideLoading}
              />
            </label>
            <label>
              Reason (optional)
              <input
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                maxLength={200}
                disabled={overrideBusy || overrideLoading}
              />
            </label>
            <button
              type="button"
              className="secondary"
              onClick={applyManualPriceOverride}
              disabled={
                loading ||
                publishing ||
                executingOrders ||
                executingSellOrders ||
                repricingBusy ||
                dailyCloseBusy ||
                overrideBusy ||
                overrideLoading
              }
            >
              {overrideBusy ? "Applying Override..." : "Apply Manual Price Override"}
            </button>
          </>
        )}
      </div>

      {overrideResult ? (
        <table>
          <thead>
            <tr>
              <th>Player</th>
              <th>Previous Price</th>
              <th>Current Price</th>
              <th>Reason</th>
              <th>Updated At</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{overrideResult.result_player_name}</td>
              <td>{formatFlagAmount(overrideResult.result_previous_price)}</td>
              <td>{formatFlagAmount(overrideResult.result_current_price)}</td>
              <td>{overrideResult.result_override_reason ?? "--"}</td>
              <td>{formatEasternDateTime(overrideResult.result_updated_at)}</td>
            </tr>
          </tbody>
        </table>
      ) : null}

      </div>

      <div className="card">
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
            dailyCloseBusy ||
            overrideBusy
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
            dailyCloseBusy ||
            overrideBusy
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
    </div>
  );
}
