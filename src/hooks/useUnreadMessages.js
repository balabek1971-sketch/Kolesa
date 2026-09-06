import { useEffect, useState } from "react";
import {
  fetchUnreadMessageCount,
  supabase,
  UNREAD_MESSAGES_CHANGED_EVENT,
} from "../lib/supabase.js";

const REFRESH_DELAY_MS = 120;

export function useUnreadMessages(session) {
  const userId = session?.user?.id || "";
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!userId || !supabase) {
      setUnreadCount(0);
      return undefined;
    }

    let active = true;
    let refreshTimer;
    const refreshUnreadCount = async () => {
      try {
        const nextCount = await fetchUnreadMessageCount(userId);
        if (active) setUnreadCount(nextCount);
      } catch (error) {
        console.error("Не удалось загрузить количество непрочитанных сообщений", error);
      }
    };
    const scheduleRefresh = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(refreshUnreadCount, REFRESH_DELAY_MS);
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") scheduleRefresh();
    };

    setUnreadCount(0);
    refreshUnreadCount();
    window.addEventListener(UNREAD_MESSAGES_CHANGED_EVENT, scheduleRefresh);
    window.addEventListener("online", scheduleRefresh);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    const channel = supabase
      .channel(`unread-message-count-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        scheduleRefresh,
      )
      .subscribe();

    return () => {
      active = false;
      window.clearTimeout(refreshTimer);
      window.removeEventListener(UNREAD_MESSAGES_CHANGED_EVENT, scheduleRefresh);
      window.removeEventListener("online", scheduleRefresh);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return unreadCount;
}
