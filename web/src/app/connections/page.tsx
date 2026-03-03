"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import RequireAuth from "@/components/require-auth";
import TopNav from "@/components/top-nav";
import { TableSkeleton } from "@/components/ui-skeletons";
import { EmptyState, ErrorState } from "@/components/ui-states";
import { formatFlagAmount } from "@/lib/format";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type FollowListRow = {
  result_user_id: string;
  result_username: string;
  result_net_worth: number | string | null;
  result_is_following: boolean;
  result_follows_you: boolean;
  result_followed_at: string;
};

type FollowCountRow = {
  result_total_count: number;
};

type FollowStateRow = {
  result_target_user_id: string;
  result_is_following: boolean;
  result_follows_you: boolean;
  result_follower_count: number;
  result_following_count: number;
};

type PublicProfileSnapshotRow = {
  result_username: string;
};

type ListKind = "followers" | "following";
type SortKind = "newest" | "oldest" | "net_worth";

const PAGE_SIZE = 20;

function parseListKind(value: string | null): ListKind {
  return value === "followers" ? "followers" : "following";
}

function parseSortKind(value: string): SortKind {
  if (value === "oldest" || value === "net_worth") return value;
  return "newest";
}

function formatEasternMonthDay(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "2-digit"
  })
    .format(parsed)
    .replace(" ", "-");
}

function formatNetWorth(value: number | string | null): string {
  const parsed =
    typeof value === "number" ? value : Number.parseFloat(String(value ?? "NaN"));
  if (!Number.isFinite(parsed)) return "--";
  return formatFlagAmount(parsed);
}

export default function ConnectionsPage() {
  return (
    <main>
      <TopNav />
      <h1>Connections</h1>
      <RequireAuth>{(session) => <ConnectionsPanel viewerUserId={session.user.id} />}</RequireAuth>
    </main>
  );
}

function ConnectionsPanel({ viewerUserId }: { viewerUserId: string }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetFromQuery = searchParams.get("user");
  const tabFromQuery = parseListKind(searchParams.get("tab"));
  const targetUserId =
    targetFromQuery && targetFromQuery.length > 0 ? targetFromQuery : viewerUserId;
  const isSelf = targetUserId === viewerUserId;

  const [activeTab, setActiveTab] = useState<ListKind>(tabFromQuery);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKind, setSortKind] = useState<SortKind>("newest");
  const [mutualOnly, setMutualOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<FollowListRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [followState, setFollowState] = useState<FollowStateRow | null>(null);
  const [targetUsername, setTargetUsername] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [rowBusyUserId, setRowBusyUserId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setActiveTab(tabFromQuery);
  }, [tabFromQuery]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, searchQuery, sortKind, mutualOnly, targetUserId]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const updateRoute = useCallback(
    (nextTab: ListKind) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", nextTab);
      if (isSelf) {
        params.delete("user");
      } else {
        params.set("user", targetUserId);
      }
      router.replace(`/connections?${params.toString()}`);
    },
    [isSelf, router, searchParams, targetUserId]
  );

  const loadMeta = useCallback(async () => {
    const [followStateResult, profileSnapshotResult] = await Promise.all([
      supabase.rpc("get_follow_state", { target_user_id: targetUserId }),
      isSelf
        ? Promise.resolve({ data: [{ result_username: "You" }], error: null })
        : supabase.rpc("get_public_profile_snapshot", { target_user_id: targetUserId })
    ]);

    if (followStateResult.error) {
      setError(followStateResult.error.message);
      setFollowState(null);
      return;
    }

    const followRows = (followStateResult.data ?? []) as FollowStateRow[];
    setFollowState(followRows[0] ?? null);

    if (profileSnapshotResult.error) {
      setTargetUsername(targetUserId);
    } else {
      const profileRows = (profileSnapshotResult.data ?? []) as PublicProfileSnapshotRow[];
      setTargetUsername(profileRows[0]?.result_username ?? targetUserId);
    }
  }, [isSelf, supabase, targetUserId]);

  const loadConnections = useCallback(async () => {
    setLoadingList(true);
    setError("");
    const normalizedSearch = searchQuery.trim();
    const rpcSearch = normalizedSearch.length > 0 ? normalizedSearch : null;
    const offsetCount = (page - 1) * PAGE_SIZE;

    const [listResult, countResult] = await Promise.all([
      supabase.rpc("get_follow_list_page", {
        target_user_id: targetUserId,
        list_kind: activeTab,
        search_query: rpcSearch,
        sort_kind: sortKind,
        only_mutuals: mutualOnly,
        limit_count: PAGE_SIZE,
        offset_count: offsetCount
      }),
      supabase.rpc("get_follow_list_count", {
        target_user_id: targetUserId,
        list_kind: activeTab,
        search_query: rpcSearch,
        only_mutuals: mutualOnly
      })
    ]);

    if (listResult.error) {
      setError(listResult.error.message);
      setRows([]);
      setTotalCount(0);
      setLoadingList(false);
      return;
    }

    if (countResult.error) {
      setError(countResult.error.message);
      setRows([]);
      setTotalCount(0);
      setLoadingList(false);
      return;
    }

    const listRows = (listResult.data ?? []) as FollowListRow[];
    const countRows = (countResult.data ?? []) as FollowCountRow[];
    setRows(listRows);
    setTotalCount(countRows[0]?.result_total_count ?? 0);
    setLoadingList(false);
  }, [activeTab, mutualOnly, page, searchQuery, sortKind, supabase, targetUserId]);

  useEffect(() => {
    loadMeta().catch((loadError: unknown) => {
      const msg = loadError instanceof Error ? loadError.message : "Unknown load error";
      setError(msg);
    });
  }, [loadMeta]);

  useEffect(() => {
    loadConnections().catch((loadError: unknown) => {
      const msg = loadError instanceof Error ? loadError.message : "Unknown load error";
      setError(msg);
      setRows([]);
      setTotalCount(0);
      setLoadingList(false);
    });
  }, [loadConnections]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearchQuery(searchInput.trim());
  }

  function clearSearch() {
    setSearchInput("");
    setSearchQuery("");
    setPage(1);
  }

  async function toggleRowFollow(row: FollowListRow) {
    if (row.result_user_id === viewerUserId) return;

    setRowBusyUserId(row.result_user_id);
    setError("");

    const fnName = row.result_is_following ? "unfollow_user" : "follow_user";
    const { error: toggleError } = await supabase.rpc(fnName, {
      target_user_id: row.result_user_id
    });

    if (toggleError) {
      setError(toggleError.message);
      setRowBusyUserId(null);
      return;
    }

    await loadConnections();
    if (isSelf) {
      await loadMeta();
    }
    setRowBusyUserId(null);
  }

  const listLabel = activeTab === "followers" ? "Followers" : "Following";
  const emptyMessage = searchQuery
    ? mutualOnly
      ? `No Mutual ${listLabel} Found For "${searchQuery}".`
      : `No ${listLabel} Found For "${searchQuery}".`
    : mutualOnly
      ? `No Mutual ${listLabel} Found Yet.`
      : `No ${listLabel} Found Yet.`;

  return (
    <div className="grid">
      <div className="card connections-toolbar">
        <div className="connections-summary">
          <div>
            <h2>{isSelf ? "Your Connections" : `${targetUsername || "User"}'s Connections`}</h2>
          </div>
          <button
            type="button"
            className="secondary"
            onClick={() => router.push(isSelf ? "/dashboard" : `/profiles/${targetUserId}`)}
          >
            {isSelf ? "Back To User Profile" : "Back To Public Profile"}
          </button>
        </div>

        <div className="tab-row">
          <button
            type="button"
            className={activeTab === "followers" ? "" : "secondary"}
            onClick={() => {
              setActiveTab("followers");
              updateRoute("followers");
            }}
          >
            Followers ({followState?.result_follower_count ?? 0})
          </button>
          <button
            type="button"
            className={activeTab === "following" ? "" : "secondary"}
            onClick={() => {
              setActiveTab("following");
              updateRoute("following");
            }}
          >
            Following ({followState?.result_following_count ?? 0})
          </button>
        </div>

        <form className="connections-search-row" onSubmit={submitSearch}>
          <label className="connections-search-input">
            Search Username
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Type a username..."
            />
          </label>
          <button type="submit">Search</button>
          <button type="button" className="secondary" onClick={clearSearch}>
            Clear
          </button>
        </form>

        <div className="connections-filter-row">
          <label className="connections-filter-select">
            Sort By
            <select
              value={sortKind}
              onChange={(event) => setSortKind(parseSortKind(event.target.value))}
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="net_worth">Net Worth</option>
            </select>
          </label>
          <button
            type="button"
            aria-pressed={mutualOnly}
            className={mutualOnly ? "" : "secondary"}
            onClick={() => setMutualOnly((current) => !current)}
          >
            {mutualOnly ? "Viewing Mutuals Only" : "Show Mutuals Only"}
          </button>
        </div>
      </div>

      {loadingList ? (
        <div className="card">
          <p className="muted connections-list-meta">
            Loading {listLabel.toLowerCase()}...
          </p>
          <TableSkeleton columns={4} rows={6} />
        </div>
      ) : null}
      {error ? <ErrorState message={error} variant="card" /> : null}

      {!loadingList && !error ? (
        <div className="card">
          {rows.length === 0 ? (
            <EmptyState message={emptyMessage} />
          ) : (
            <>
              <p className="muted connections-list-meta">
                Showing {rows.length} Of {totalCount} {listLabel}
                {mutualOnly ? " (Mutuals Only)" : ""}
              </p>
              <table className="connections-table">
                <colgroup>
                  <col className="connections-col-user" />
                  <col className="connections-col-networth" />
                  <col className="connections-col-date" />
                  <col className="connections-col-action" />
                </colgroup>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Net Worth</th>
                    <th>Date</th>
                    <th className="connections-col-action">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={`${activeTab}-${row.result_user_id}`}>
                      <td>
                        <div className="connections-user-cell">
                          <Link href={`/profiles/${row.result_user_id}`}>
                            {row.result_username}
                          </Link>
                          {row.result_follows_you ? (
                            <span className="connections-user-badge">
                              {row.result_is_following ? "Mutual" : "Follows You"}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td>{formatNetWorth(row.result_net_worth)}</td>
                      <td>{formatEasternMonthDay(row.result_followed_at)}</td>
                      <td className="connections-col-action">
                        {row.result_user_id === viewerUserId ? (
                          <span className="muted">You</span>
                        ) : (
                          <button
                            type="button"
                            className={row.result_is_following ? "secondary" : ""}
                            disabled={rowBusyUserId === row.result_user_id}
                            onClick={() => {
                              toggleRowFollow(row).catch((toggleError: unknown) => {
                                const msg =
                                  toggleError instanceof Error
                                    ? toggleError.message
                                    : "Unknown follow toggle error";
                                setError(msg);
                                setRowBusyUserId(null);
                              });
                            }}
                          >
                            {rowBusyUserId === row.result_user_id
                              ? "Saving..."
                              : row.result_is_following
                                ? "Unfollow"
                                : row.result_follows_you
                                  ? "Follow Back"
                                  : "Follow"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="connections-pagination">
                <button
                  type="button"
                  className="secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                >
                  Previous Page
                </button>
                <p className="connections-page-indicator">
                  Page {page} Of {totalPages}
                </p>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
                >
                  Next Page
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
