"use client";

import Link from "next/link";
import { ReactNode } from "react";
import { Session } from "@supabase/supabase-js";
import { CardSkeleton } from "@/components/ui-skeletons";
import { useAuthSession } from "@/components/session-provider";
import { EmptyState, LoadingState } from "@/components/ui-states";

type RequireAuthProps = {
  children: (session: Session) => ReactNode;
};

export default function RequireAuth({ children }: RequireAuthProps) {
  const { session, loading } = useAuthSession();

  if (loading) {
    return (
      <div className="grid">
        <LoadingState message="Checking login status..." variant="card" />
        <CardSkeleton />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="card">
        <EmptyState
          title="Login required"
          message="Please sign in before opening this page."
        />
        <p>
          <Link href="/auth">Go to Auth</Link>
        </p>
      </div>
    );
  }

  return <>{children(session)}</>;
}
