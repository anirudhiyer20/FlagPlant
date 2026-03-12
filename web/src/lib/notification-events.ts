export const NOTIFICATION_REFRESH_EVENT = "flagplant:notifications-refresh";

export function requestNotificationRefresh(reason: string = "manual") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(NOTIFICATION_REFRESH_EVENT, {
      detail: {
        reason,
        requested_at: Date.now()
      }
    })
  );
}
