export const autofeedRefreshEvent = "qazauto-autofeed-refresh";

const snapshotKey = "qazauto_autofeed_snapshot_v2";
const refreshKey = "qazauto_autofeed_refresh_v1";
let snapshot = null;
let refreshOnNextMount = false;

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

export function hasAutofeedRefreshRequest() {
  try {
    return refreshOnNextMount || sessionStorage.getItem(refreshKey) === "1";
  } catch {
    return refreshOnNextMount;
  }
}

export function clearAutofeedRefreshRequest() {
  refreshOnNextMount = false;
  try {
    sessionStorage.removeItem(refreshKey);
  } catch {
    // Storage can be disabled in strict privacy modes.
  }
}

export function requestAutofeedRefresh(event) {
  event?.preventDefault();
  if (window.location.hash.startsWith("#/autofeed")) {
    window.dispatchEvent(new Event(autofeedRefreshEvent));
    return;
  }

  refreshOnNextMount = true;
  try {
    sessionStorage.setItem(refreshKey, "1");
  } catch {
    // The module flag is enough for normal single-page navigation.
  }
  window.location.hash = "/autofeed";
}
