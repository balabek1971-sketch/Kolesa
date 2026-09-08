import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CarFront, Check, CheckCheck, LoaderCircle, MessageCircle, Send } from "lucide-react";
import { AuthPanel } from "../components/AuthPanel.jsx";
import { PushNotificationPrompt } from "../components/PushNotificationPrompt.jsx";
import { formatPrice } from "../lib/format.js";
import { notifyMessagePush } from "../lib/pushNotifications.js";
import {
  fetchConversationMessages,
  fetchConversations,
  markConversationRead,
  sendConversationMessage,
  supabase,
} from "../lib/supabase.js";

function shortTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function ConversationList({ activeId, conversations, loading }) {
  if (loading) return <div className="messages-empty"><LoaderCircle className="loading-icon" size={24} />Загружаем диалоги</div>;
  if (!conversations.length) return <div className="messages-empty"><MessageCircle size={30} /><strong>Сообщений пока нет</strong><span>Откройте объявление и напишите продавцу.</span></div>;

  return (
    <div className="conversation-list">
      {conversations.map((conversation) => (
        <a className={conversation.id === activeId ? "active" : ""} href={`#/messages/${conversation.id}`} key={conversation.id}>
          <span className="conversation-photo">
            {conversation.imageUrl ? <img src={conversation.imageUrl} alt="" /> : <CarFront size={25} />}
          </span>
          <span className="conversation-copy">
            <span><strong>{conversation.otherDisplayName}</strong><time>{shortTime(conversation.lastMessageAt)}</time></span>
            <b>{conversation.listingTitle}</b>
            <small>{conversation.lastMessage}</small>
          </span>
          {conversation.unreadCount > 0 && <i>{conversation.unreadCount}</i>}
        </a>
      ))}
    </div>
  );
}

function ConversationThread({ accessToken, conversation, currentUserId }) {
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const historyRef = useRef(null);

  function scrollHistoryToBottom() {
    const history = historyRef.current;
    if (history) history.scrollTop = history.scrollHeight;
  }

  const markReadIfVisible = useCallback(async () => {
    if (!conversation?.id || document.visibilityState !== "visible") return;
    await markConversationRead(conversation.id);
  }, [conversation?.id]);

  const loadMessages = useCallback(async () => {
    if (!conversation?.id) return;
    setLoading(true);
    setError("");
    try {
      setMessages(await fetchConversationMessages(conversation.id));
      await markReadIfVisible();
    } catch (loadError) {
      setError(loadError.message || "Не удалось загрузить сообщения.");
    } finally {
      setLoading(false);
    }
  }, [conversation?.id, markReadIfVisible]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    if (!conversation?.id || !supabase) return undefined;
    const channel = supabase
      .channel(`conversation-${conversation.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversation.id}` },
        ({ new: message }) => {
          setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
          if (message.sender_id !== currentUserId) markReadIfVisible().catch(() => undefined);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversation.id}` },
        ({ new: message }) => {
          setMessages((current) => current.map((item) => item.id === message.id ? { ...item, ...message } : item));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversation?.id, currentUserId, markReadIfVisible]);

  useEffect(() => {
    if (!conversation?.id) return undefined;
    const handleVisibility = () => {
      if (document.visibilityState === "visible") markReadIfVisible().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
    };
  }, [conversation?.id, markReadIfVisible]);

  useEffect(() => {
    scrollHistoryToBottom();
  }, [messages]);

  useEffect(() => {
    if (!conversation?.id) return undefined;
    const viewport = window.visualViewport;
    let scrollFrame = 0;

    function updateViewport() {
      const height = Math.round(viewport?.height || window.innerHeight);
      document.documentElement.style.setProperty("--messages-viewport-height", `${height}px`);
      window.cancelAnimationFrame(scrollFrame);
      scrollFrame = window.requestAnimationFrame(() => {
        scrollHistoryToBottom();
      });
    }

    updateViewport();
    window.addEventListener("resize", updateViewport);
    viewport?.addEventListener("resize", updateViewport);
    return () => {
      window.cancelAnimationFrame(scrollFrame);
      window.removeEventListener("resize", updateViewport);
      viewport?.removeEventListener("resize", updateViewport);
      document.documentElement.style.removeProperty("--messages-viewport-height");
    };
  }, [conversation?.id]);

  async function handleSubmit(event) {
    event.preventDefault();
    const messageBody = body.trim();
    if (!messageBody || sending) return;
    setSending(true);
    setError("");
    try {
      const messageId = await sendConversationMessage(conversation.id, messageBody);
      setBody("");
      window.setTimeout(loadMessages, 250);
      notifyMessagePush(messageId, accessToken).catch((pushError) => {
        console.error("Не удалось отправить push-уведомление", pushError);
      });
    } catch (sendError) {
      setError(sendError.message || "Не удалось отправить сообщение.");
    } finally {
      setSending(false);
    }
  }

  if (!conversation) {
    return <div className="message-thread-placeholder"><MessageCircle size={36} /><strong>Выберите диалог</strong></div>;
  }

  return (
    <section className="message-thread">
      <header>
        <a className="message-mobile-back" href="#/messages" aria-label="Назад к диалогам"><ArrowLeft size={21} /></a>
        <div>
          <strong>{conversation.otherDisplayName}</strong>
          <a href={`#/cars/${conversation.listingId}`}>{conversation.listingTitle} · {formatPrice(conversation.listingPrice)}</a>
        </div>
      </header>
      <div className="message-history" ref={historyRef}>
        {loading ? (
          <div className="messages-empty"><LoaderCircle className="loading-icon" size={24} />Загружаем сообщения</div>
        ) : messages.length ? messages.map((message) => (
          <div className={message.sender_id === currentUserId ? "message-bubble mine" : "message-bubble"} key={message.id}>
            <p>{message.body}</p>
            <div className="message-bubble-meta">
              <time>{shortTime(message.created_at)}</time>
              {message.sender_id === currentUserId && (
                <span className={message.read_at ? "message-read-state read" : "message-read-state"}>
                  {message.read_at
                    ? <CheckCheck aria-hidden="true" size={13} />
                    : <Check aria-hidden="true" size={13} />}
                  {message.read_at ? "Прочитано" : "Отправлено"}
                </span>
              )}
            </div>
          </div>
        )) : (
          <div className="messages-empty"><strong>Начните разговор</strong><span>Спросите о состоянии, истории или просмотре автомобиля.</span></div>
        )}
      </div>
      {error && <p className="message-error" role="alert">{error}</p>}
      <form className="message-composer" onSubmit={handleSubmit}>
        <textarea
          aria-label="Сообщение"
          maxLength="2000"
          placeholder="Напишите сообщение"
          rows="1"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button type="submit" disabled={sending || !body.trim()} aria-label="Отправить сообщение">
          {sending ? <LoaderCircle className="loading-icon" size={20} /> : <Send size={20} />}
        </button>
      </form>
    </section>
  );
}

export function MessagesPage({ auth, conversationId }) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    navigator.clearAppBadge?.().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!auth.session) return;
    setLoading(true);
    fetchConversations()
      .then(setConversations)
      .catch((loadError) => setError(loadError.message || "Не удалось загрузить диалоги."))
      .finally(() => setLoading(false));
  }, [auth.session, conversationId]);

  const activeConversation = useMemo(
    () => conversations.find((item) => item.id === conversationId) || null,
    [conversationId, conversations],
  );

  if (auth.loading) return <main className="standalone-page"><p className="page-status">Загружаем сообщения...</p></main>;
  if (!auth.session) return <main className="standalone-page"><AuthPanel configured={auth.configured} /></main>;

  return (
    <main className={conversationId ? "messages-page thread-open" : "messages-page"}>
      <section className="messages-shell">
        <aside className="messages-sidebar">
          <header><p className="eyebrow">Общение</p><h1>Сообщения</h1></header>
          <PushNotificationPrompt accessToken={auth.session.access_token} />
          {error && <p className="message-error" role="alert">{error}</p>}
          <ConversationList activeId={conversationId} conversations={conversations} loading={loading} />
        </aside>
        <ConversationThread
          accessToken={auth.session.access_token}
          conversation={activeConversation}
          currentUserId={auth.session.user.id}
        />
      </section>
    </main>
  );
}
