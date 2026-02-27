"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Mode = "signup" | "login";

export default function AuthPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [mode, setMode] = useState<Mode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
        setMessage(
          "Signup sent. If email confirmation is enabled in Supabase, check your inbox before login."
        );
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        if (signInError) throw signInError;
        setMessage("Logged in successfully.");
      }
    } catch (submitError) {
      const errorMessage =
        submitError instanceof Error ? submitError.message : "Unknown auth error";
      setError(errorMessage);
    } finally {
      setBusy(false);
    }
  }

  async function onSignOut() {
    setBusy(true);
    setMessage("");
    setError("");
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setError(signOutError.message);
    } else {
      setMessage("Signed out.");
    }
    setBusy(false);
  }

  return (
    <main>
      <h1>Auth</h1>
      <p className="muted">
        Beta notice: Please use a funny fake password while we test
        security/privacy features.
      </p>
      <p>
        <Link href="/">Back to Home</Link>
      </p>
      <p>
        <Link href="/opinion">Go to Daily Opinion</Link>
      </p>
      <p>
        <Link href="/players">Go to Players</Link>
      </p>

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
            <button type="button" onClick={onSignOut} disabled={busy}>
              Sign out
            </button>
          </div>
        </form>

        {message ? <p className="success">{message}</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </div>
    </main>
  );
}
