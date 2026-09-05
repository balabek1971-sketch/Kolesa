export const autofeedRefreshEvent = "qazauto-autofeed-refresh";

const snapshotKey = "qazauto_autofeed_snapshot_v2";
let snapshot = null;

export function readAutofeedState() {
  if (snapshot) return snapshot;
  try {
    const stored = JSON.parse(sessionStorage.getItem(snapshotKey) || "null");
    if (stored && Array.isArray(stored.listings)) snapshot = stored;
  } catch {
    sessionStorage.removeItem(snapshotKey);
  }
  return snapshot;
}

export function writeAutofeedState(nextSnapshot) {
  snapshot = nextSnapshot;
  try {
    sessionStorage.setItem(snapshotKey, JSON.stringify(nextSnapshot));
  } catch {
    // The in-memory copy still preserves navigation when storage is unavailable.
  }
}

export function clearAutofeedState() {
  snapshot = null;
  try {
    sessionStorage.removeItem(snapshotKey);
  } catch {
    // Storage can be disabled in strict privacy modes.
  }
}

export function requestAutofeedRefresh(event) {
  if (!window.location.hash.startsWith("#/autofeed")) return;
  event?.preventDefault();
  window.dispatchEvent(new Event(autofeedRefreshEvent));
}
