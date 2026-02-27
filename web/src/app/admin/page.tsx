"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import RequireAuth from "@/components/require-auth";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatFlagAmount } from "@/lib/format";

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

function todayString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

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
  const [selectedDate, setSelectedDate] = useState(todayString());
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loadingRole, setLoadingRole] = useState(true);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [previewRows, setPreviewRows] = useState<WinnerRow[]>([]);
  const [publishedRows, setPublishedRows] = useState<PublishedRow[]>([]);
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
      <h2>Winner Tools</h2>
      <div className="grid">
        <label>
          Target date
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </label>
        <button type="button" onClick={loadPreview} disabled={loading || publishing}>
          {loading ? "Loading..." : "Preview Top 5"}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={publishWinners}
          disabled={publishing || loading}
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
    </div>
  );
}
