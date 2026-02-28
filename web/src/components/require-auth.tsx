"use client";

import Link from "next/link";
import { ReactNode } from "react";
import { Session } from "@supabase/supabase-js";
import AuthStateGate from "@/components/auth-state-gate";
import { CardSkeleton } from "@/components/ui-skeletons";
import { LoadingState } from "@/components/ui-states";

type RequireAuthProps = {
  children: (session: Session) => ReactNode;
};

export default function RequireAuth({ children }: RequireAuthProps) {
  return (
    <AuthStateGate
      onLoading={() => (
        <div className="grid">
          <LoadingState message="Checking login status..." variant="card" />
          <CardSkeleton />
        </div>
      )}
      onSignedOut={() => (
        <p className="muted">
          Sign in from the top-right navigation button to access this page, or{" "}
          <Link href="/auth">open Auth</Link>.
        </p>
      )}
      onSignedIn={(session) => children(session)}
    />
  );
}
