"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuthSession } from "@/components/session-provider";
import { formatFlagAmount } from "@/lib/format";
import { NET_WORTH_REFRESH_EVENT } from "@/lib/net-worth-events";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const items = [
  { href: "/", label: "Home" },
  { href: "/ball-knowledge", label: "Ball Knowledge" },
  { href: "/flag-market", label: "Flag Market" },
  { href: "/leaderboard", label: "Leaderboard" }
];

const profileItem = { href: "/dashboard", label: "User Profile" };
const NET_WORTH_CACHE_PREFIX = "flagplant:nav-net-worth:v2";
const NET_WORTH_CACHE_TTL_MS = 60_000;
const ET_DAY_WATCH_INTERVAL_MS = 5 * 60 * 1000;

type NetWorthCacheEntry = {
  value: number;
  updatedAt: number;
};

function readCachedNetWorth(targetUserId: string): NetWorthCacheEntry | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(`${NET_WORTH_CACHE_PREFIX}:${targetUserId}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<NetWorthCacheEntry>;
    if (
      typeof parsed.value !== "number" ||
      !Number.isFinite(parsed.value) ||
      typeof parsed.updatedAt !== "number" ||
      !Number.isFinite(parsed.updatedAt)
    ) {
      return null;
    }
    return { value: parsed.value, updatedAt: parsed.updatedAt };
  } catch {
    return null;
  }
}

function writeCachedNetWorth(targetUserId: string, value: number) {
  if (typeof window === "undefined") return;
  const payload: NetWorthCacheEntry = { value, updatedAt: Date.now() };
  window.localStorage.setItem(`${NET_WORTH_CACHE_PREFIX}:${targetUserId}`, JSON.stringify(payload));
}

function getEasternDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
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

    async function refreshNetWorth(targetUserId: string) {
      if (typeof document !== "undefined" && document.hidden) return;

      const { data, error } = await supabase.rpc("get_public_profile_snapshot", {
        target_user_id: targetUserId
      });

      if (!active) return;
      if (error) {
        return;
      }

      const row = ((data ?? []) as { result_net_worth?: number }[])[0];
      const value = row?.result_net_worth ?? null;
      setNetWorth(value);
      if (value !== null) {
        writeCachedNetWorth(targetUserId, value);
      }
    }

    if (!currentUserId) {
      setNetWorth(null);
      return () => {
        active = false;
      };
    }

    const cached = readCachedNetWorth(currentUserId);
    if (cached && Date.now() - cached.updatedAt <= NET_WORTH_CACHE_TTL_MS) {
      setNetWorth(cached.value);
    }

    refreshNetWorth(currentUserId).catch(() => {
      if (!active) return;
    });

    function onFocus() {
      void refreshNetWorth(currentUserId);
    }

    function onVisibilityChange() {
      if (document.hidden) return;
      void refreshNetWorth(currentUserId);
    }

    function onNetWorthRefresh() {
      void refreshNetWorth(currentUserId);
    }

    let lastEasternDate = getEasternDateString();
    const dayWatchIntervalId = window.setInterval(() => {
      const nextEasternDate = getEasternDateString();
      if (nextEasternDate === lastEasternDate) return;
      lastEasternDate = nextEasternDate;
      void refreshNetWorth(currentUserId);
    }, ET_DAY_WATCH_INTERVAL_MS);

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener(NET_WORTH_REFRESH_EVENT, onNetWorthRefresh);

    return () => {
      active = false;
      window.clearInterval(dayWatchIntervalId);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener(NET_WORTH_REFRESH_EVENT, onNetWorthRefresh);
    };
  }, [currentUserId, pathname, supabase]);

  async function onSignOut() {
    setSigningOut(true);
    await signOut();
    setSigningOut(false);
    router.push("/auth");
    router.refresh();
  }

  function getAuthHrefWithReturnPath(): string {
    const currentPath =
      typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}`
        : pathname;

    if (!currentPath || currentPath === "/" || currentPath.startsWith("/auth")) {
      return "/auth";
    }

    return `/auth?next=${encodeURIComponent(currentPath)}`;
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
          onClick={() => router.push(getAuthHrefWithReturnPath())}
        >
          Sign in
        </button>
      )}
    </nav>
  );
}
