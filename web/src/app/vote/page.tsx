"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import RequireAuth from "@/components/require-auth";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type AssignmentRow = {
  id: string;
  opinion_id: string;
  assigned_for_date: string;
};

type OpinionRow = {
  id: string;
  body: string;
};

type VoteRow = {
  opinion_id: string;
};

type VoteItem = {
  assignmentId: string;
  opinionId: string;
  assignedForDate: string;
  body: string;
};

function todayString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function VotePage() {
  return (
    <main>
      <h1>Vote</h1>
      <p>
        <Link href="/">Back to Home</Link>
      </p>
      <p>
        <Link href="/dashboard">Go to Dashboard</Link>
      </p>
      <p>
        <Link href="/opinion">Go to Daily Opinion</Link>
      </p>
      <p>
        <Link href="/players">Go to Players</Link>
      </p>
      <p>
        <Link href="/admin">Go to Admin</Link>
      </p>
      <RequireAuth>{(session) => <VotePanel userId={session.user.id} />}</RequireAuth>
    </main>
  );
}

function VotePanel({ userId }: { userId: string }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [items, setItems] = useState<VoteItem[]>([]);
  const [votedOpinionIds, setVotedOpinionIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyOpinionId, setBusyOpinionId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const voteDate = useMemo(() => todayString(), []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    setMessage("");

    const { data: assignmentData, error: assignmentError } = await supabase
      .from("opinion_assignments")
      .select("id,opinion_id,assigned_for_date")
      .eq("viewer_user_id", userId)
      .eq("assigned_for_date", voteDate);

    if (assignmentError) {
      setError(assignmentError.message);
      setItems([]);
      setLoading(false);
      return;
    }

    const assignments = (assignmentData ?? []) as AssignmentRow[];
    if (assignments.length === 0) {
      setItems([]);
      setVotedOpinionIds([]);
      setLoading(false);
      return;
    }

    const opinionIds = assignments.map((row) => row.opinion_id);
    const { data: opinionData, error: opinionError } = await supabase
      .from("opinions")
      .select("id,body")
      .in("id", opinionIds);

    if (opinionError) {
      setError(opinionError.message);
      setItems([]);
      setLoading(false);
      return;
    }

    const opinionMap = new Map(
      ((opinionData ?? []) as OpinionRow[]).map((row) => [row.id, row.body])
    );

    const { data: voteData, error: voteError } = await supabase
      .from("opinion_votes")
      .select("opinion_id")
      .eq("voter_user_id", userId)
      .eq("assigned_for_date", voteDate);

    if (voteError) {
      setError(voteError.message);
      setItems([]);
      setLoading(false);
      return;
    }

    const voteOpinionIds = ((voteData ?? []) as VoteRow[]).map((row) => row.opinion_id);
    setVotedOpinionIds(voteOpinionIds);

    const merged: VoteItem[] = assignments
      .map((assignment) => ({
        assignmentId: assignment.id,
        opinionId: assignment.opinion_id,
        assignedForDate: assignment.assigned_for_date,
        body: opinionMap.get(assignment.opinion_id) ?? ""
      }))
      .filter((item) => item.body.length > 0);

    setItems(merged);
    setLoading(false);
  }, [supabase, userId, voteDate]);

  useEffect(() => {
    loadData().catch((loadError: unknown) => {
      const msg = loadError instanceof Error ? loadError.message : "Unknown load error";
      setError(msg);
      setLoading(false);
    });
  }, [loadData]);

  async function castVote(item: VoteItem) {
    setBusyOpinionId(item.opinionId);
    setError("");
    setMessage("");

    const { error: insertError } = await supabase.from("opinion_votes").insert({
      opinion_id: item.opinionId,
      voter_user_id: userId,
      assigned_for_date: item.assignedForDate
    });

    if (insertError) {
      if (insertError.code === "23505") {
        setError("Vote already recorded for this opinion.");
      } else {
        setError(insertError.message);
      }
      setBusyOpinionId(null);
      return;
    }

    setVotedOpinionIds((prev) =>
      prev.includes(item.opinionId) ? prev : [...prev, item.opinionId]
    );
    setMessage("Vote recorded.");
    setBusyOpinionId(null);
  }

  const votedCount = votedOpinionIds.length;
  const totalCount = items.length;

  return (
    <div className="card">
      <p className="muted">Voting date: {voteDate}</p>
      <p className="muted">
        Votes cast: {votedCount}/{totalCount}
      </p>

      {loading ? <p>Loading vote assignments...</p> : null}
      {message ? <p className="success">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {!loading && totalCount === 0 ? (
        <>
          <p>No opinion assignments found for today.</p>
          <p className="muted">
            For local testing, run `supabase/dev_seed_vote_assignments.sql` in
            Supabase SQL Editor after at least two different users submit
            opinions on the same date.
          </p>
        </>
      ) : null}

      {!loading && totalCount > 0 ? (
        <div className="grid">
          {items.map((item) => {
            const voted = votedOpinionIds.includes(item.opinionId);
            return (
              <div className="card" key={item.assignmentId}>
                <p>{item.body}</p>
                <button
                  disabled={voted || busyOpinionId === item.opinionId}
                  onClick={() => castVote(item)}
                  type="button"
                >
                  {voted
                    ? "Voted"
                    : busyOpinionId === item.opinionId
                      ? "Submitting..."
                      : "Vote"}
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
