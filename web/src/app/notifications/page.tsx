"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import RequireAuth from "@/components/require-auth";
import TopNav from "@/components/top-nav";
import { CardSkeleton, TableSkeleton } from "@/components/ui-skeletons";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui-states";
import { formatEasternDateTime } from "@/lib/dates";
import { requestNotificationRefresh } from "@/lib/notification-events";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type NotificationRow = {
  result_id: string;
  result_title: string;
  result_body: string;
  result_payload: Record<string, unknown> | null;
  result_read_at: string | null;
  result_created_at: string;
};

type PreferenceRow = {
  result_event_type: string;
  result_enabled: boolean;
};

const PAGE_SIZE = 25;

const PREFERENCE_LABELS: Record<string, string> = {
  order_executed: "Order Executed",
  order_failed: "Order Failed",
  order_cancelled: "Order Cancelled",
  winner_published: "Winner Published",
  vote_assignments_available: "Vote Assignments Ready"
};

const PREFERENCE_ORDER = [
  "order_executed",
  "order_failed",
  "order_cancelled",
  "winner_published",
  "vote_assignments_available"
];

export default function NotificationsPage() {
  return (
    <main>
      <TopNav />
      <h1>Notifications</h1>
      <RequireAuth>{() => <NotificationsPanel />}</RequireAuth>
    </main>
  );
}

function NotificationsPanel() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [showPreferences, setShowPreferences] = useState(false);
  const [preferences, setPreferences] = useState<Record<string, boolean>>({});
  const [preferencesBusy, setPreferencesBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectAllRef = useRef<HTMLInputElement | null>(null);

  const loadUnreadCount = useCallback(async () => {
    const { data, error: countError } = await supabase.rpc("get_unread_notification_count");
    if (countError) {
      throw new Error(countError.message);
    }
    const countRow = ((data ?? []) as { result_unread_count?: number }[])[0];
    setUnreadCount(countRow?.result_unread_count ?? 0);
  }, [supabase]);

  const loadNotifications = useCallback(
    async (nextOffset: number, replace: boolean) => {
      setBusy(true);
      setError("");
      setMessage("");

      const { data, error: notificationsError } = await supabase.rpc(
        "get_notifications_page",
        {
          limit_count: PAGE_SIZE,
          offset_count: nextOffset,
          unread_only: unreadOnly
        }
      );

      if (notificationsError) {
        setError(notificationsError.message);
        setBusy(false);
        setLoading(false);
        return;
      }

      const nextRows = (data ?? []) as NotificationRow[];
      setRows((previous) => (replace ? nextRows : [...previous, ...nextRows]));
      if (replace) {
        setSelectedIds(new Set());
      }
      setOffset(nextOffset + nextRows.length);
      setHasMore(nextRows.length === PAGE_SIZE);
      setBusy(false);
      setLoading(false);
    },
    [supabase, unreadOnly]
  );

  const refreshAll = useCallback(async () => {
    await Promise.all([loadNotifications(0, true), loadUnreadCount()]);
  }, [loadNotifications, loadUnreadCount]);

  const loadPreferences = useCallback(async () => {
    const { data, error: preferencesError } = await supabase.rpc("get_notification_preferences");
    if (preferencesError) {
      throw new Error(preferencesError.message);
    }

    const rows = (data ?? []) as PreferenceRow[];
    const nextMap: Record<string, boolean> = {};
    rows.forEach((row) => {
      nextMap[row.result_event_type] = row.result_enabled;
    });
    setPreferences(nextMap);
  }, [supabase]);

  useEffect(() => {
    setLoading(true);
    setRows([]);
    setOffset(0);
    setHasMore(true);
    refreshAll()
      .catch((loadError: unknown) => {
        const msg = loadError instanceof Error ? loadError.message : "Unknown load error";
        setError(msg);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [refreshAll, unreadOnly]);

  useEffect(() => {
    loadPreferences().catch((loadError: unknown) => {
      const msg = loadError instanceof Error ? loadError.message : "Unable to load preferences";
      setError(msg);
    });
  }, [loadPreferences]);

  async function markOneRead(notificationId: string) {
    setBusy(true);
    setError("");
    setMessage("");

    const { data, error: markError } = await supabase.rpc("mark_notification_read", {
      target_notification_id: notificationId
    });
    if (markError) {
      setError(markError.message);
      setBusy(false);
      return;
    }

    const row = ((data ?? []) as { result_updated?: boolean }[])[0];
    if (!row?.result_updated) {
      setBusy(false);
      return;
    }

    setRows((previous) => {
      if (unreadOnly) {
        return previous.filter((item) => item.result_id !== notificationId);
      }
      return previous.map((item) =>
        item.result_id === notificationId && item.result_read_at === null
          ? { ...item, result_read_at: new Date().toISOString() }
          : item
      );
    });
    setUnreadCount((previous) => Math.max(previous - 1, 0));
    setSelectedIds((previous) => {
      const next = new Set(previous);
      next.delete(notificationId);
      return next;
    });
    requestNotificationRefresh("notifications:mark-one");
    setBusy(false);
  }

  async function markAllRead() {
    setBusy(true);
    setError("");
    setMessage("");

    const { data, error: markAllError } = await supabase.rpc("mark_all_notifications_read");
    if (markAllError) {
      setError(markAllError.message);
      setBusy(false);
      return;
    }

    const row = ((data ?? []) as { result_updated_count?: number }[])[0];
    const updatedCount = row?.result_updated_count ?? 0;
    setRows((previous) =>
      previous.map((item) =>
        item.result_read_at === null
          ? { ...item, result_read_at: new Date().toISOString() }
          : item
      )
    );
    setUnreadCount(0);
    setMessage(
      updatedCount > 0 ? `Marked ${updatedCount} notifications as read.` : "No unread notifications."
    );
    requestNotificationRefresh("notifications:mark-all");
    setBusy(false);
  }

  async function deleteSelectedNotifications() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    const unreadDeletedCount = rows.reduce((acc, row) => {
      if (!selectedIds.has(row.result_id)) return acc;
      return row.result_read_at === null ? acc + 1 : acc;
    }, 0);

    setBusy(true);
    setError("");
    setMessage("");

    const results = await Promise.all(
      ids.map((id) =>
        supabase.rpc("delete_notification", {
          target_notification_id: id
        })
      )
    );

    const firstError = results.find((result) => result.error)?.error;
    if (firstError) {
      setError(firstError.message);
      setBusy(false);
      return;
    }

    const deletedCount = results.reduce((acc, result) => {
      const row = ((result.data ?? []) as { result_deleted?: boolean }[])[0];
      return row?.result_deleted ? acc + 1 : acc;
    }, 0);

    if (deletedCount > 0) {
      setRows((previous) => previous.filter((item) => !selectedIds.has(item.result_id)));
      setSelectedIds(new Set());
      if (unreadDeletedCount > 0) {
        setUnreadCount((previous) => Math.max(previous - unreadDeletedCount, 0));
      }
      setMessage(`Deleted ${deletedCount} notifications.`);
      requestNotificationRefresh("notifications:delete-selected");
    }

    setBusy(false);
  }

  const allOnPageSelected = rows.length > 0 && rows.every((row) => selectedIds.has(row.result_id));
  const someOnPageSelected = rows.some((row) => selectedIds.has(row.result_id)) && !allOnPageSelected;

  useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate = someOnPageSelected;
  }, [someOnPageSelected]);

  function toggleRowSelection(notificationId: string) {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(notificationId)) {
        next.delete(notificationId);
      } else {
        next.add(notificationId);
      }
      return next;
    });
  }

  function toggleSelectAllOnPage() {
    setSelectedIds((previous) => {
      if (allOnPageSelected) {
        return new Set(Array.from(previous).filter((id) => !rows.some((row) => row.result_id === id)));
      }
      const next = new Set(previous);
      rows.forEach((row) => next.add(row.result_id));
      return next;
    });
  }

  async function setPreference(eventType: string, enabled: boolean) {
    setPreferencesBusy(true);
    setError("");
    setMessage("");

    const previousValue = preferences[eventType];
    setPreferences((previous) => ({ ...previous, [eventType]: enabled }));

    const { error: preferenceError } = await supabase.rpc("set_notification_preference", {
      target_event_type: eventType,
      target_enabled: enabled
    });

    if (preferenceError) {
      setPreferences((previous) => ({ ...previous, [eventType]: previousValue }));
      setError(preferenceError.message);
      setPreferencesBusy(false);
      return;
    }

    setPreferencesBusy(false);
  }

  return (
    <div className="grid">
      {loading ? (
        <>
          <LoadingState message="Loading notifications..." />
          <div className="card">
            <CardSkeleton />
            <div className="table-top-space">
              <TableSkeleton columns={4} rows={6} />
            </div>
          </div>
        </>
      ) : null}

      {message ? <p className="success">{message}</p> : null}
      {error ? <ErrorState message={error} /> : null}

      {!loading && !error ? (
        <div className="card">
          <div className="notifications-feed-header">
            <h2>Activity Feed</h2>
            <div className="notifications-header-controls">
              <button
                type="button"
                className="secondary notifications-trash-button"
                aria-label={`Delete Selected Notifications (${selectedIds.size})`}
                title={`Delete Selected Notifications (${selectedIds.size})`}
                onClick={() => {
                  void deleteSelectedNotifications();
                }}
                disabled={busy || selectedIds.size === 0}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9z"
                    fill="currentColor"
                  />
                </svg>
              </button>
              <label className="muted" htmlFor="notification-feed-filter">
                Show
              </label>
              <select
                id="notification-feed-filter"
                className="notifications-filter-select"
                value={unreadOnly ? "unread" : "all"}
                onChange={(event) => setUnreadOnly(event.target.value === "unread")}
                disabled={busy}
              >
                <option value="all">All</option>
                <option value="unread">Unread</option>
              </select>
              <button type="button" onClick={markAllRead} disabled={busy || unreadCount === 0}>
                Mark All Read ({unreadCount})
              </button>
            </div>
          </div>
          {rows.length === 0 ? (
            <>
              <EmptyState message={unreadOnly ? "No unread notifications." : "No notifications yet."} />
              <div className="notifications-footer-row table-top-space">
                <span />
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    void refreshAll();
                  }}
                  disabled={busy}
                >
                  Refresh
                </button>
              </div>
            </>
          ) : (
            <>
              <table>
                <thead>
                  <tr>
                    <th className="notifications-select-col">
                      <input
                        ref={selectAllRef}
                        type="checkbox"
                        aria-label="Select all notifications on this page"
                        checked={allOnPageSelected}
                        onChange={toggleSelectAllOnPage}
                        disabled={busy || rows.length === 0}
                      />
                    </th>
                    <th>Date</th>
                    <th>Title</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.result_id}>
                      <td className="notifications-select-col">
                        <input
                          type="checkbox"
                          aria-label={`Select notification ${row.result_title}`}
                          checked={selectedIds.has(row.result_id)}
                          onChange={() => toggleRowSelection(row.result_id)}
                          disabled={busy}
                        />
                      </td>
                      <td>{formatEasternDateTime(row.result_created_at)}</td>
                      <td>
                        <div className="notifications-title-cell">
                          <span>{row.result_title}</span>
                          <span className="muted">{row.result_body}</span>
                        </div>
                      </td>
                      <td className="notifications-status-cell">
                        <div className="notifications-status-actions">
                          {row.result_read_at ? (
                            <span className="muted">Read</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                void markOneRead(row.result_id);
                              }}
                              disabled={busy}
                            >
                              Mark Read
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="notifications-footer-row table-top-space">
                {hasMore ? (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      void loadNotifications(offset, false);
                    }}
                    disabled={busy}
                  >
                    {busy ? "Loading..." : "Load More"}
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    void refreshAll();
                  }}
                  disabled={busy}
                >
                  Refresh
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}

      {!loading && !error ? (
        <div className="notifications-preferences-toggle-row">
          <button
            type="button"
            className="secondary"
            onClick={() => setShowPreferences((previous) => !previous)}
            disabled={preferencesBusy}
          >
            {showPreferences ? "Hide Notification Preferences" : "Change Notification Preferences"}
          </button>
        </div>
      ) : null}

      {!loading && !error && showPreferences ? (
        <div className="card">
          <h2>Notification Preferences</h2>
          <p className="muted">
            Turn events on or off. Disabled events stop creating new notifications.
          </p>
          <div className="notifications-preferences-grid table-top-space">
            {PREFERENCE_ORDER.map((eventType) => {
              const enabled = preferences[eventType] ?? true;
              return (
                <label key={eventType} className="notifications-preference-item">
                  <input
                    type="checkbox"
                    checked={enabled}
                    disabled={preferencesBusy}
                    onChange={(event) => {
                      void setPreference(eventType, event.target.checked);
                    }}
                  />
                  <span>{PREFERENCE_LABELS[eventType] ?? eventType}</span>
                </label>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
