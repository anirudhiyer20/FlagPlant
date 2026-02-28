"use client";

import Link from "next/link";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type RequireAuthProps = {
  children: (session: Session) => ReactNode;
};

export default function RequireAuth({ children }: RequireAuthProps) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const timeoutId = window.setTimeout(() => {
      if (!mounted) return;
      setLoading(false);
    }, 6000);

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setSession(data.session);
        setLoading(false);
      })
      .catch(() => {
        if (!mounted) return;
        setLoading(false);
      });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      mounted = false;
      window.clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, [supabase]);

  if (loading) {
    return (
      <div className="card">
        <p>Checking login status...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="card">
        <h2>Login required</h2>
        <p className="muted">Please sign in before opening this page.</p>
        <p>
          <Link href="/auth">Go to Auth</Link>
        </p>
      </div>
    );
  }

  return <>{children(session)}</>;
}
