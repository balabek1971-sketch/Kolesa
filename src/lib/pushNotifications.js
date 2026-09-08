const apiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");

export function pushNotificationsSupported() {
  return Boolean(
    apiBaseUrl
    && window.isSecureContext
    && "Notification" in window
    && "serviceWorker" in navigator
    && "PushManager" in window,
  );
}

function base64UrlToUint8Array(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const raw = window.atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

async function apiRequest(path, accessToken, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Не удалось настроить уведомления.");
  return payload;
}

async function fetchPublicKey() {
  const response = await fetch(`${apiBaseUrl}/v1/push/public-key`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.enabled || !payload.public_key) {
    throw new Error("Уведомления пока не настроены на сервере.");
  }
  return payload.public_key;
}

async function saveSubscription(subscription, accessToken) {
  return apiRequest("/v1/push/subscriptions", accessToken, {
    method: "POST",
    body: JSON.stringify(subscription.toJSON()),
  });
}

export async function syncPushSubscription(accessToken, { create = false } = {}) {
  if (!pushNotificationsSupported() || Notification.permission !== "granted") return null;
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription && create) {
    const publicKey = await fetchPublicKey();
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(publicKey),
    });
  }
  if (subscription) await saveSubscription(subscription, accessToken);
  return subscription;
}

export async function enablePushNotifications(accessToken) {
  if (!pushNotificationsSupported()) throw new Error("Уведомления не поддерживаются на этом устройстве.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Разрешение на уведомления не выдано.");
  return syncPushSubscription(accessToken, { create: true });
}

export async function disablePushNotifications(accessToken) {
  if (!pushNotificationsSupported()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  try {
    await apiRequest("/v1/push/subscriptions", accessToken, {
      method: "DELETE",
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
  } finally {
    await subscription.unsubscribe().catch(() => undefined);
  }
}

export async function notifyMessagePush(messageId, accessToken) {
  if (!apiBaseUrl || !messageId || !accessToken) return;
  await apiRequest(`/v1/messages/${encodeURIComponent(messageId)}/push`, accessToken, {
    method: "POST",
    body: "{}",
    keepalive: true,
  });
}
