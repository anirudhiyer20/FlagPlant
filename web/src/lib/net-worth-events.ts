export const NET_WORTH_REFRESH_EVENT = "flagplant:networth-refresh";

export function requestNetWorthRefresh(reason: string = "manual") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(NET_WORTH_REFRESH_EVENT, {
      detail: {
        reason,
        requested_at: Date.now()
      }
    })
  );
}

