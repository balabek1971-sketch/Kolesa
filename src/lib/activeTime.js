export function startVisibleTimer(options = {}) {
  const documentRef = options.documentRef || document;
  const now = options.now || (() => performance.now());
  let elapsed = 0;
  let startedAt = documentRef.visibilityState === "visible" ? now() : null;
  let stopped = false;

  function pause() {
    if (startedAt === null) return;
    elapsed += Math.max(0, now() - startedAt);
    startedAt = null;
  }

  function handleVisibilityChange() {
    if (documentRef.visibilityState === "visible") {
      if (startedAt === null) startedAt = now();
    } else {
      pause();
    }
  }

  documentRef.addEventListener("visibilitychange", handleVisibilityChange);

  return {
    stop() {
      if (stopped) return Math.round(elapsed);
      stopped = true;
      pause();
      documentRef.removeEventListener("visibilitychange", handleVisibilityChange);
      return Math.round(elapsed);
    },
  };
}
