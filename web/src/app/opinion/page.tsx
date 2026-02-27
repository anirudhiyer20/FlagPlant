"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import RequireAuth from "@/components/require-auth";

type ExistingOpinion = {
  id: string;
  body: string;
  created_at: string;
};

function todayString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function OpinionPage() {
  return (
    <main>
      <h1>Daily Opinion</h1>
      <p>
        <Link href="/">Back to Home</Link>
      </p>
      <p>
        <Link href="/players">Go to Players</Link>
      </p>
      <RequireAuth>{(session) => <OpinionForm userId={session.user.id} />}</RequireAuth>
    </main>
  );
}

function OpinionForm({ userId }: { userId: string }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [body, setBody] = useState("");
  const [existingOpinion, setExistingOpinion] = useState<ExistingOpinion | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const submissionDate = useMemo(() => todayString(), []);

  useEffect(() => {
    async function loadTodayOpinion() {
      setLoading(true);
      setError("");
      const { data, error: fetchError } = await supabase
        .from("opinions")
        .select("id,body,created_at")
        .eq("user_id", userId)
        .eq("submitted_for_date", submissionDate)
        .maybeSingle();

      if (fetchError) {
        setError(fetchError.message);
        setLoading(false);
        return;
      }

      setExistingOpinion((data as ExistingOpinion | null) ?? null);
      setLoading(false);
    }

    loadTodayOpinion().catch((loadError: unknown) => {
      const msg = loadError instanceof Error ? loadError.message : "Unknown load error";
      setError(msg);
      setLoading(false);
    });
  }, [submissionDate, supabase, userId]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");

    const trimmed = body.trim();
    if (!trimmed) {
      setError("Opinion cannot be empty.");
      setBusy(false);
      return;
    }

    const { data, error: insertError } = await supabase
      .from("opinions")
      .insert({
        user_id: userId,
        body: trimmed,
        submitted_for_date: submissionDate
      })
      .select("id,body,created_at")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        setError("You already submitted an opinion for today.");
      } else {
        setError(insertError.message);
      }
      setBusy(false);
      return;
    }

    setExistingOpinion(data as ExistingOpinion);
    setBody("");
    setMessage("Submitted. You can add another opinion tomorrow.");
    setBusy(false);
  }

  return (
    <div className="card">
      <p className="muted">Submission date: {submissionDate}</p>
      {loading ? <p>Loading your opinion status...</p> : null}
      {message ? <p className="success">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {!loading && existingOpinion ? (
        <>
          <h2>Today&apos;s submitted opinion</h2>
          <p>{existingOpinion.body}</p>
        </>
      ) : null}

      {!loading && !existingOpinion ? (
        <>
          <h2>Submit today&apos;s opinion</h2>
          <form onSubmit={onSubmit} className="grid">
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
            <button disabled={busy} type="submit">
              {busy ? "Submitting..." : "Submit opinion"}
            </button>
          </form>
        </>
      ) : null}
    </div>
  );
}
