"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useAuthSession } from "@/components/session-provider";
import { CardSkeleton } from "@/components/ui-skeletons";
import { LoadingState } from "@/components/ui-states";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Mode = "signup" | "login";

function getSafeNextPath(nextParam: string | null): string | null {
  if (!nextParam) return null;
  if (!nextParam.startsWith("/")) return null;
  if (nextParam.startsWith("//")) return null;
  if (nextParam.startsWith("/auth")) return null;
  return nextParam;
}

export default function AuthPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session, loading: sessionLoading } = useAuthSession();
  const nextPath = useMemo(
    () => getSafeNextPath(searchParams.get("next")),
    [searchParams]
  );
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!sessionLoading && session) {
      router.replace(nextPath ?? "/dashboard");
    }
  }, [nextPath, router, session, sessionLoading]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");

    try {
      if (mode === "signup") {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { username }
          }
        });

        if (signUpError) throw signUpError;
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session) {
          router.replace(nextPath ?? "/dashboard");
          return;
        }

        setMessage("Signup sent. Check your inbox to confirm email before login.");
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        if (signInError) throw signInError;
        router.replace(nextPath ?? "/dashboard");
        return;
      }
    } catch (submitError) {
      const errorMessage =
        submitError instanceof Error ? submitError.message : "Unknown auth error";
      setError(errorMessage);
    } finally {
      setBusy(false);
    }
  }

  if (sessionLoading) {
    return (
      <main>
        <h1>Auth</h1>
        <LoadingState message="Loading..." />
        <CardSkeleton />
      </main>
    );
  }

  return (
    <main>
      <h1>Auth</h1>
      <p className="muted">
        Beta notice: Please use a funny fake password while we test
        security/privacy features.
      </p>
      {nextPath ? (
        <p className="muted">After sign in, you&apos;ll return to {nextPath}.</p>
      ) : null}

      <div className="card">
        <h2>{mode === "signup" ? "Create account" : "Sign in"}</h2>
        <form onSubmit={onSubmit} className="grid">
          {mode === "signup" ? (
            <label>
              Username (3-24 chars)
              <input
                required
                minLength={3}
                maxLength={24}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>
          ) : null}

          <label>
            Email
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <label>
            Password
            <input
              required
              type="password"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          <div className="grid">
            <button disabled={busy} type="submit">
              {busy
                ? "Working..."
                : mode === "signup"
                  ? "Sign up"
                  : "Sign in"}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setMode(mode === "signup" ? "login" : "signup")}
              disabled={busy}
            >
              Switch to {mode === "signup" ? "login" : "signup"}
            </button>
          </div>
        </form>

        {message ? <p className="success">{message}</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </div>
    </main>
  );
}
