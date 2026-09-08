import { useEffect, useState } from "react";
import { Bell, BellOff, LoaderCircle } from "lucide-react";
import {
  enablePushNotifications,
  pushNotificationsSupported,
  syncPushSubscription,
} from "../lib/pushNotifications.js";

function installedOnIOS() {
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  return !ios || window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}

export function PushNotificationPrompt({ accessToken }) {
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    if (!pushNotificationsSupported()) {
      setStatus("unsupported");
      return undefined;
    }
    if (!installedOnIOS()) {
      setStatus("install-required");
      return undefined;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return undefined;
    }
    if (Notification.permission !== "granted") {
      setStatus("available");
      return undefined;
    }
    syncPushSubscription(accessToken, { create: true })
      .then(() => {
        if (active) setStatus("enabled");
      })
      .catch((syncError) => {
        if (active) {
          setError(syncError.message || "Не удалось включить уведомления.");
          setStatus("error");
        }
      });
    return () => { active = false; };
  }, [accessToken]);

  async function enable() {
    setStatus("loading");
    setError("");
    try {
      await enablePushNotifications(accessToken);
      setStatus("enabled");
    } catch (enableError) {
      setError(enableError.message || "Не удалось включить уведомления.");
      setStatus(Notification.permission === "denied" ? "denied" : "error");
    }
  }

  if (status === "enabled" || status === "unsupported") return null;
  if (status === "install-required") {
    return <div className="push-notification-prompt"><Bell size={19} /><span>Добавьте QazAuto на экран «Домой», чтобы получать сообщения.</span></div>;
  }
  if (status === "denied") {
    return <div className="push-notification-prompt blocked"><BellOff size={19} /><span>Уведомления запрещены в настройках телефона.</span></div>;
  }
  return (
    <div className="push-notification-prompt">
      <Bell size={19} />
      <span>{error || "Получайте новые сообщения, даже когда приложение закрыто."}</span>
      <button type="button" onClick={enable} disabled={status === "loading"}>
        {status === "loading" ? <LoaderCircle className="loading-icon" size={17} /> : "Включить"}
      </button>
    </div>
  );
}
