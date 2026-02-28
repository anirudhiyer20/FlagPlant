"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import RequireAuth from "@/components/require-auth";
import TopNav from "@/components/top-nav";
import { getEasternDateString } from "@/lib/dates";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type ExistingOpinion = {
  id: string;
  body: string;
  created_at: string;
};

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

type BallKnowledgeTab = "opinion" | "vote";

export default function BallKnowledgePage() {
  return (
    <main>
      <TopNav />
      <h1>Ball Knowledge</h1>
      <RequireAuth>{(session) => <BallKnowledgePanel userId={session.user.id} />}</RequireAuth>
    </main>
  );
}

function BallKnowledgePanel({ userId }: { userId: string }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const appDate = useMemo(() => getEasternDateString(), []);
  const [activeTab, setActiveTab] = useState<BallKnowledgeTab>("opinion");

  const [body, setBody] = useState("");
  const [existingOpinion, setExistingOpinion] = useState<ExistingOpinion | null>(null);
  const [items, setItems] = useState<VoteItem[]>([]);
  const [votedOpinionIds, setVotedOpinionIds] = useState<string[]>([]);

  const [loadingOpinion, setLoadingOpinion] = useState(true);
  const [loadingVote, setLoadingVote] = useState(true);
  const [busyOpinion, setBusyOpinion] = useState(false);
  const [busyVoteOpinionId, setBusyVoteOpinionId] = useState<string | null>(null);

  const [opinionMessage, setOpinionMessage] = useState("");
  const [opinionError, setOpinionError] = useState("");
  const [voteMessage, setVoteMessage] = useState("");
  const [voteError, setVoteError] = useState("");

  const loadOpinion = useCallback(async () => {
    setLoadingOpinion(true);
    setOpinionError("");
    const { data, error } = await supabase
      .from("opinions")
      .select("id,body,created_at")
      .eq("user_id", userId)
      .eq("submitted_for_date", appDate)
      .maybeSingle();

    if (error) {
      setOpinionError(error.message);
      setLoadingOpinion(false);
      return;
    }

    setExistingOpinion((data as ExistingOpinion | null) ?? null);
    setLoadingOpinion(false);
  }, [appDate, supabase, userId]);

  const loadVotes = useCallback(async () => {
    setLoadingVote(true);
    setVoteError("");
    setVoteMessage("");

    const { data: assignmentData, error: assignmentError } = await supabase
      .from("opinion_assignments")
      .select("id,opinion_id,assigned_for_date")
      .eq("viewer_user_id", userId)
      .eq("assigned_for_date", appDate);

    if (assignmentError) {
      setVoteError(assignmentError.message);
      setItems([]);
      setLoadingVote(false);
      return;
    }

    const assignments = (assignmentData ?? []) as AssignmentRow[];
    if (assignments.length === 0) {
      setItems([]);
      setVotedOpinionIds([]);
      setLoadingVote(false);
      return;
    }

    const opinionIds = assignments.map((row) => row.opinion_id);
    const { data: opinionData, error: opinionError } = await supabase
      .from("opinions")
      .select("id,body")
      .in("id", opinionIds);

    if (opinionError) {
      setVoteError(opinionError.message);
      setItems([]);
      setLoadingVote(false);
      return;
    }

    const opinionMap = new Map(
      ((opinionData ?? []) as OpinionRow[]).map((row) => [row.id, row.body])
    );

    const { data: voteData, error: voteFetchError } = await supabase
      .from("opinion_votes")
      .select("opinion_id")
      .eq("voter_user_id", userId)
      .eq("assigned_for_date", appDate);

    if (voteFetchError) {
      setVoteError(voteFetchError.message);
      setItems([]);
      setLoadingVote(false);
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
    setLoadingVote(false);
  }, [appDate, supabase, userId]);

  useEffect(() => {
    loadOpinion().catch((err: unknown) => {
      setOpinionError(err instanceof Error ? err.message : "Unknown load error");
      setLoadingOpinion(false);
    });
    loadVotes().catch((err: unknown) => {
      setVoteError(err instanceof Error ? err.message : "Unknown load error");
      setLoadingVote(false);
    });
  }, [loadOpinion, loadVotes]);

  async function submitOpinion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyOpinion(true);
    setOpinionMessage("");
    setOpinionError("");

    const trimmed = body.trim();
    if (!trimmed) {
      setOpinionError("Opinion cannot be empty.");
      setBusyOpinion(false);
      return;
    }

    const { data, error } = await supabase
      .from("opinions")
      .insert({
        user_id: userId,
        body: trimmed,
        submitted_for_date: appDate
      })
      .select("id,body,created_at")
      .single();

    if (error) {
      setOpinionError(error.code === "23505" ? "You already submitted for today." : error.message);
      setBusyOpinion(false);
      return;
    }

    setExistingOpinion(data as ExistingOpinion);
    setBody("");
    setOpinionMessage("Submitted. You can post again tomorrow.");
    setBusyOpinion(false);
  }

  async function castVote(item: VoteItem) {
    setBusyVoteOpinionId(item.opinionId);
    setVoteError("");
    setVoteMessage("");

    const { error } = await supabase.from("opinion_votes").insert({
      opinion_id: item.opinionId,
      voter_user_id: userId,
      assigned_for_date: item.assignedForDate
    });

    if (error) {
      setVoteError(error.code === "23505" ? "Vote already recorded." : error.message);
      setBusyVoteOpinionId(null);
      return;
    }

    setVotedOpinionIds((prev) =>
      prev.includes(item.opinionId) ? prev : [...prev, item.opinionId]
    );
    setVoteMessage("Vote recorded.");
    setBusyVoteOpinionId(null);
  }

  return (
    <div className="grid">
      <div className="card">
        <div className="tab-row">
          <button
            type="button"
            onClick={() => setActiveTab("opinion")}
            className={activeTab === "opinion" ? "" : "secondary"}
          >
            Daily Opinion
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("vote")}
            className={activeTab === "vote" ? "" : "secondary"}
          >
            Vote
          </button>
        </div>
      </div>

      {activeTab === "opinion" ? (
        <div className="card">
        <h2>Daily Opinion</h2>
        {loadingOpinion ? <p>Loading your opinion status...</p> : null}
        {opinionMessage ? <p className="success">{opinionMessage}</p> : null}
        {opinionError ? <p className="error">{opinionError}</p> : null}

        {!loadingOpinion && existingOpinion ? (
          <>
            <p className="success">Submitted for today.</p>
            <p>{existingOpinion.body}</p>
          </>
        ) : null}

        {!loadingOpinion && !existingOpinion ? (
          <form onSubmit={submitOpinion} className="grid">
            <label>
              Opinion (1-280 chars)
              <textarea
                required
                minLength={1}
                maxLength={280}
                rows={5}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </label>
            <p className="muted">Characters: {body.length}/280</p>
            <button disabled={busyOpinion} type="submit">
              {busyOpinion ? "Submitting..." : "Submit opinion"}
            </button>
          </form>
        ) : null}
        </div>
      ) : null}

      {activeTab === "vote" ? (
        <div className="card">
        <h2>Vote</h2>
        <p className="muted">You vote on yesterday&apos;s submitted opinions.</p>
        <p className="muted">
          Votes cast: {votedOpinionIds.length}/{items.length}
        </p>

        {loadingVote ? <p>Loading vote assignments...</p> : null}
        {voteMessage ? <p className="success">{voteMessage}</p> : null}
        {voteError ? <p className="error">{voteError}</p> : null}

        {!loadingVote && items.length === 0 ? (
          <p className="muted">No assignments found for today&apos;s voting date.</p>
        ) : null}

        {!loadingVote && items.length > 0 ? (
          <div className="grid">
            {items.map((item) => {
              const voted = votedOpinionIds.includes(item.opinionId);
              return (
                <div className="card" key={item.assignmentId}>
                  <p>{item.body}</p>
                  <button
                    disabled={voted || busyVoteOpinionId === item.opinionId}
                    onClick={() => castVote(item)}
                    type="button"
                  >
                    {voted
                      ? "Voted"
                      : busyVoteOpinionId === item.opinionId
                        ? "Submitting..."
                        : "Vote"}
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}
        </div>
      ) : null}
    </div>
  );
}
