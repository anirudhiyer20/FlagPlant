"use client";

import Link from "next/link";
import { ReactNode } from "react";
import { Session } from "@supabase/supabase-js";
import { useAuthSession } from "@/components/session-provider";

type RequireAuthProps = {
  children: (session: Session) => ReactNode;
};

export default function RequireAuth({ children }: RequireAuthProps) {
  const { session, loading } = useAuthSession();

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
