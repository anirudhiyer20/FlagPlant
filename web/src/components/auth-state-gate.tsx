"use client";

import { ReactNode } from "react";
import { Session } from "@supabase/supabase-js";
import { useAuthSession } from "@/components/session-provider";

type AuthStateGateProps = {
  onSignedIn: (session: Session) => ReactNode;
  onSignedOut: () => ReactNode;
  onLoading?: () => ReactNode;
};

export default function AuthStateGate({
  onSignedIn,
  onSignedOut,
  onLoading
}: AuthStateGateProps) {
  const { session, loading } = useAuthSession();

  if (loading) {
    return onLoading ? <>{onLoading()}</> : null;
  }

  if (!session) {
    return <>{onSignedOut()}</>;
  }

  return <>{onSignedIn(session)}</>;
}
