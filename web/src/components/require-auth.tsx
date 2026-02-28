"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ReactNode } from "react";
import { Session } from "@supabase/supabase-js";
import AuthStateGate from "@/components/auth-state-gate";
import { CardSkeleton } from "@/components/ui-skeletons";
import { LoadingState } from "@/components/ui-states";

type RequireAuthProps = {
  children: (session: Session) => ReactNode;
};

export default function RequireAuth({ children }: RequireAuthProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentPath = `${pathname}${
    searchParams.toString().length > 0 ? `?${searchParams.toString()}` : ""
  }`;
  const authHref =
    currentPath.length > 0 && currentPath !== "/" && !currentPath.startsWith("/auth")
      ? `/auth?next=${encodeURIComponent(currentPath)}`
      : "/auth";

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
          <Link href={authHref}>open Auth</Link>.
        </p>
      )}
      onSignedIn={(session) => children(session)}
    />
  );
}
