"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuthSession } from "@/components/session-provider";
import { formatFlagAmount } from "@/lib/format";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const items = [
  { href: "/", label: "Home" },
  { href: "/ball-knowledge", label: "Ball Knowledge" },
  { href: "/flag-market", label: "Flag Market" },
  { href: "/leaderboard", label: "Leaderboard" }
];

const profileItem = { href: "/dashboard", label: "User Profile" };
const NET_WORTH_CACHE_PREFIX = "flagplant:nav-net-worth:v1";

function getEasternPart(date: Date, type: Intl.DateTimeFormatPartTypes): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);

  const value = parts.find((part) => part.type === type)?.value;
  return Number.parseInt(value ?? "0", 10);
}

function getEasternDateString(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

// Daily cache bucket rolls at 08:00 ET.
function getNetWorthCacheBucket(now: Date = new Date()): string {
  const etHour = getEasternPart(now, "hour");
  const baseDate = etHour < 8 ? new Date(now.getTime() - 8 * 60 * 60 * 1000) : now;
  return getEasternDateString(baseDate);
}

export default function TopNav() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const pathname = usePathname();
  const router = useRouter();
  const { session, signOut } = useAuthSession();
  const isLoggedIn = Boolean(session);
  const currentUserId = session?.user.id ?? null;
  const [netWorth, setNetWorth] = useState<number | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadNetWorth(targetUserId: string) {
      const bucket = getNetWorthCacheBucket();
      const cacheKey = `${NET_WORTH_CACHE_PREFIX}:${targetUserId}:${bucket}`;
      const cachedValue =
        typeof window !== "undefined" ? window.localStorage.getItem(cacheKey) : null;

      if (cachedValue !== null) {
        const parsed = Number.parseFloat(cachedValue);
        if (Number.isFinite(parsed)) {
          setNetWorth(parsed);
          return;
        }
      }

      const { data, error } = await supabase.rpc("get_public_profile_snapshot", {
        target_user_id: targetUserId
      });

      if (!active) return;
      if (error) {
        setNetWorth(null);
        return;
      }

      const row = ((data ?? []) as { result_net_worth?: number }[])[0];
      const value = row?.result_net_worth ?? null;
      setNetWorth(value);
      if (typeof window !== "undefined" && value !== null) {
        window.localStorage.setItem(cacheKey, String(value));
      }
    }

    if (!currentUserId) {
      setNetWorth(null);
      return () => {
        active = false;
      };
    }

    loadNetWorth(currentUserId).catch(() => {
      if (!active) return;
      setNetWorth(null);
    });

    return () => {
      active = false;
    };
  }, [currentUserId, supabase]);

  async function onSignOut() {
    setSigningOut(true);
    await signOut();
    setSigningOut(false);
    router.push("/auth");
    router.refresh();
  }

  return (
    <nav className="top-nav" aria-label="Primary">
      {items.map((item) => {
        const isActive =
          pathname === item.href ||
          (item.href !== "/" && pathname.startsWith(item.href));

        return (
          <Link
            key={item.href}
            href={item.href}
            className={isActive ? "active" : ""}
          >
            {item.label}
          </Link>
        );
      })}
      {isLoggedIn ? (
        <button type="button" className="nav-networth" disabled>
          Net Worth: {formatFlagAmount(netWorth)}
        </button>
      ) : null}
      <Link
        href={profileItem.href}
        className={`${
          pathname === profileItem.href || pathname.startsWith(profileItem.href)
            ? "active"
            : ""
        } profile-link ${!isLoggedIn ? "push-right" : ""}`.trim()}
      >
        {profileItem.label}
      </Link>
      {isLoggedIn ? (
        <button
          type="button"
          className="nav-signout"
          onClick={onSignOut}
          disabled={signingOut}
        >
          {signingOut ? "Signing out..." : "Sign out"}
        </button>
      ) : (
        <button
          type="button"
          className="nav-signout"
          onClick={() => router.push("/auth")}
        >
          Sign in
        </button>
      )}
    </nav>
  );
}
