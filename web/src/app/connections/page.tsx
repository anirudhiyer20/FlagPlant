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

type ConnectionDetailSnapshotRow = {
  result_user_id: string;
  result_username: string;
  result_net_worth: number | string | null;
  result_holding_count: number;
  result_top_holding_player_name: string | null;
  result_top_holding_value: number | string | null;
  result_latest_winner_date: string | null;
  result_latest_winner_rank: number | null;
  result_latest_winner_votes: number | null;
  result_latest_winner_reward_flags: number | string | null;
  result_latest_winner_opinion: string | null;
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

function parseBooleanParam(value: string | null): boolean {
  return value === "1" || value === "true";
}

function parsePageParam(value: string | null): number {
  const parsed = Number.parseInt(value ?? "1", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return parsed;
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
  const searchFromQueryRaw = searchParams.get("q") ?? "";
  const searchFromQuery = searchFromQueryRaw.trim();
  const sortFromQuery = parseSortKind(searchParams.get("sort") ?? "newest");
  const mutualFromQuery = parseBooleanParam(searchParams.get("mutual"));
  const pageFromQuery = parsePageParam(searchParams.get("page"));
  const targetUserId =
    targetFromQuery && targetFromQuery.length > 0 ? targetFromQuery : viewerUserId;
  const isSelf = targetUserId === viewerUserId;

  const [activeTab, setActiveTab] = useState<ListKind>(() => tabFromQuery);
  const [searchInput, setSearchInput] = useState(() => searchFromQueryRaw);
  const [searchQuery, setSearchQuery] = useState(() => searchFromQuery);
  const [sortKind, setSortKind] = useState<SortKind>(() => sortFromQuery);
  const [mutualOnly, setMutualOnly] = useState(() => mutualFromQuery);
  const [page, setPage] = useState(() => pageFromQuery);
  const [rows, setRows] = useState<FollowListRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [followState, setFollowState] = useState<FollowStateRow | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [rowBusyUserId, setRowBusyUserId] = useState<string | null>(null);
  const [selectedDetailUserId, setSelectedDetailUserId] = useState<string | null>(null);
  const [detailLoadingUserId, setDetailLoadingUserId] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<
    Record<string, ConnectionDetailSnapshotRow | null>
  >({});
  const [detailError, setDetailError] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setActiveTab(tabFromQuery);
    setSearchInput(searchFromQueryRaw);
    setSearchQuery(searchFromQuery);
    setSortKind(sortFromQuery);
    setMutualOnly(mutualFromQuery);
    setPage(pageFromQuery);
  }, [
    tabFromQuery,
    searchFromQueryRaw,
    searchFromQuery,
    sortFromQuery,
    mutualFromQuery,
    pageFromQuery,
    targetUserId
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const syncRoute = useCallback(
    (next: Partial<{ tab: ListKind; q: string; sort: SortKind; mutual: boolean; page: number }>) => {
      const resolvedTab = next.tab ?? activeTab;
      const resolvedQuery = (next.q ?? searchQuery).trim();
      const resolvedSort = next.sort ?? sortKind;
      const resolvedMutual = next.mutual ?? mutualOnly;
      const resolvedPage = Math.max(1, next.page ?? page);

      const params = new URLSearchParams();
      params.set("tab", resolvedTab);
      if (!isSelf) {
        params.set("user", targetUserId);
      }
      if (resolvedQuery.length > 0) {
        params.set("q", resolvedQuery);
      }
      if (resolvedSort !== "newest") {
        params.set("sort", resolvedSort);
      }
      if (resolvedMutual) {
        params.set("mutual", "1");
      }
      if (resolvedPage > 1) {
        params.set("page", String(resolvedPage));
      }
      router.replace(`/connections?${params.toString()}`);
    },
    [activeTab, isSelf, mutualOnly, page, router, searchQuery, sortKind, targetUserId]
  );

  const loadMeta = useCallback(async () => {
    const followStateResult = await supabase.rpc("get_follow_state", {
      target_user_id: targetUserId
    });

    if (followStateResult.error) {
      setError(followStateResult.error.message);
      setFollowState(null);
      return;
    }

    const followRows = (followStateResult.data ?? []) as FollowStateRow[];
    setFollowState(followRows[0] ?? null);
  }, [supabase, targetUserId]);

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
    const nextQuery = searchInput.trim();
    setSearchQuery(nextQuery);
    setPage(1);
    syncRoute({ q: nextQuery, page: 1 });
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

  async function openConnectionDetail(userId: string) {
    if (selectedDetailUserId === userId) {
      setSelectedDetailUserId(null);
      setDetailLoadingUserId(null);
      setDetailError("");
      return;
    }

    setSelectedDetailUserId(userId);
    setDetailError("");

    if (detailCache[userId] !== undefined) {
      return;
    }

    setDetailLoadingUserId(userId);
    const { data, error: detailLoadError } = await supabase.rpc(
      "get_public_profile_snapshot",
      {
        target_user_id: userId
      }
    );

    if (detailLoadError) {
      setDetailError(detailLoadError.message);
      setDetailLoadingUserId(null);
      return;
    }

    const detailRows = (data ?? []) as ConnectionDetailSnapshotRow[];
    setDetailCache((current) => ({
      ...current,
      [userId]: detailRows[0] ?? null
    }));
    setDetailLoadingUserId(null);
  }

  const listLabel = activeTab === "followers" ? "Followers" : "Following";
  const emptyMessage = searchQuery
    ? mutualOnly
      ? `No Mutual ${listLabel} Found For "${searchQuery}".`
      : `No ${listLabel} Found For "${searchQuery}".`
    : mutualOnly
      ? `No Mutual ${listLabel} Found Yet.`
      : `No ${listLabel} Found Yet.`;
  const selectedDetail =
    selectedDetailUserId === null ? null : (detailCache[selectedDetailUserId] ?? null);
  const selectedRow =
    selectedDetailUserId === null
      ? null
      : rows.find((row) => row.result_user_id === selectedDetailUserId) ?? null;

  return (
    <div className="grid">
      <div className="card connections-toolbar">
        <div className="connections-top-row">
          <div className="tab-row">
            <button
              type="button"
              className={activeTab === "followers" ? "" : "secondary"}
              onClick={() => {
                setActiveTab("followers");
                setPage(1);
                syncRoute({ tab: "followers", page: 1 });
              }}
            >
              Followers ({followState?.result_follower_count ?? 0})
            </button>
            <button
              type="button"
              className={activeTab === "following" ? "" : "secondary"}
              onClick={() => {
                setActiveTab("following");
                setPage(1);
                syncRoute({ tab: "following", page: 1 });
              }}
            >
              Following ({followState?.result_following_count ?? 0})
            </button>
          </div>
          <button
            type="button"
            className="secondary"
            onClick={() => router.push(isSelf ? "/dashboard" : `/profiles/${targetUserId}`)}
          >
            {isSelf ? "Back To User Profile" : "Back To Public Profile"}
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
          <button type="submit" className="connections-search-button">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M15.5 14h-.79l-.28-.27a6 6 0 1 0-.71.71l.27.28v.79L20 21.5 21.5 20zM10 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10z"
                fill="currentColor"
              />
            </svg>
            Search
          </button>
        </form>

        <div className="connections-filter-row">
          <label className="connections-filter-select">
            Sort By
            <select
              value={sortKind}
              onChange={(event) => {
                const nextSort = parseSortKind(event.target.value);
                setSortKind(nextSort);
                setPage(1);
                syncRoute({ sort: nextSort, page: 1 });
              }}
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
            onClick={() => {
              const nextMutual = !mutualOnly;
              setMutualOnly(nextMutual);
              setPage(1);
              syncRoute({ mutual: nextMutual, page: 1 });
            }}
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
                        <div className="connections-action-group">
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
                          <button
                            type="button"
                            className={
                              selectedDetailUserId === row.result_user_id ? "" : "secondary"
                            }
                            onClick={() => {
                              openConnectionDetail(row.result_user_id).catch(
                                (detailLoadError: unknown) => {
                                  const msg =
                                    detailLoadError instanceof Error
                                      ? detailLoadError.message
                                      : "Unknown detail load error";
                                  setDetailError(msg);
                                  setDetailLoadingUserId(null);
                                }
                              );
                            }}
                          >
                            {selectedDetailUserId === row.result_user_id
                              ? "Close View"
                              : "Quick View"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {selectedDetailUserId ? (
                <div className="connections-detail-panel">
                  <div className="connections-detail-header">
                    <h3>
                      {selectedRow?.result_username ??
                        selectedDetail?.result_username ??
                        "Connection Detail"}
                    </h3>
                  </div>

                  {detailLoadingUserId === selectedDetailUserId ? (
                    <p className="muted">Loading Detail...</p>
                  ) : null}

                  {detailError ? <p className="error">{detailError}</p> : null}

                  {selectedDetail && detailLoadingUserId !== selectedDetailUserId ? (
                    <div className="connections-detail-columns">
                      <div className="connections-detail-column">
                        <p>
                          Net Worth:{" "}
                          <strong>{formatNetWorth(selectedDetail.result_net_worth)}</strong>
                        </p>
                        <p>
                          FlagPlants Count: <strong>{selectedDetail.result_holding_count}</strong>
                        </p>
                        <p>
                          Top FlagPlant:{" "}
                          <strong>
                            {selectedDetail.result_top_holding_player_name
                              ? `${selectedDetail.result_top_holding_player_name} (${formatNetWorth(selectedDetail.result_top_holding_value)})`
                              : "--"}
                          </strong>
                        </p>
                      </div>
                      <div className="connections-detail-column">
                        <p>
                          Latest Winner Date:{" "}
                          <strong>{selectedDetail.result_latest_winner_date ?? "--"}</strong>
                        </p>
                        <p>
                          Latest Winner Reward:{" "}
                          <strong>
                            {selectedDetail.result_latest_winner_reward_flags === null
                              ? "--"
                              : formatNetWorth(selectedDetail.result_latest_winner_reward_flags)}
                          </strong>
                        </p>
                        <p>
                          Latest Winning Opinion:{" "}
                          <strong>{selectedDetail.result_latest_winner_opinion ?? "--"}</strong>
                        </p>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="connections-pagination">
                <button
                  type="button"
                  className="secondary"
                  disabled={page <= 1}
                  onClick={() => {
                    const nextPage = Math.max(page - 1, 1);
                    setPage(nextPage);
                    syncRoute({ page: nextPage });
                  }}
                >
                  Previous Page
                </button>
                <p className="connections-page-indicator">
                  Page {page} Of {totalPages}
                </p>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => {
                    const nextPage = Math.min(page + 1, totalPages);
                    setPage(nextPage);
                    syncRoute({ page: nextPage });
                  }}
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
