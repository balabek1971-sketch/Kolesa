const buildId = __QAZAUTO_BUILD_ID__;

export function registerPwa() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;

  const hadController = Boolean(navigator.serviceWorker.controller);
  let refreshing = false;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register(
        `/sw.js?v=${encodeURIComponent(buildId)}`,
        { scope: "/", updateViaCache: "none" },
      );

      const update = () => registration.update().catch(() => undefined);
      window.addEventListener("online", update);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") update();
      });
      update();
    } catch (error) {
      console.error("Не удалось включить режим приложения", error);
    }
  }, { once: true });
}
