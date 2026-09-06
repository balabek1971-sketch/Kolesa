import { Heart, Home, MessageCircle, PlaySquare, UserRound } from "lucide-react";
import { requestAutofeedRefresh } from "../lib/autofeedState.js";

const items = [
  { id: "home", label: "Главная", href: "#/", icon: Home },
  { id: "favorites", label: "Избранное", href: "#/favorites", icon: Heart },
  { id: "autofeed", label: "Автолента", href: "#/autofeed", icon: PlaySquare },
  { id: "messages", label: "Сообщения", href: "#/messages", icon: MessageCircle },
  { id: "account", label: "Профиль", href: "#/account", icon: UserRound },
];

function formatBadgeCount(count) {
  return count > 99 ? "99+" : count;
}

export function MobileNavigation({ activeRoute, favoriteCount, unreadMessageCount }) {
  return (
    <nav className="mobile-navigation" aria-label="Мобильная навигация">
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.id === activeRoute;
        return (
          <a
            className={`${item.id === "autofeed" ? "primary " : ""}${active ? "active" : ""}`}
            href={item.href}
            key={item.id}
            aria-current={active ? "page" : undefined}
            aria-label={item.id === "messages" ? `Сообщения: ${unreadMessageCount} непрочитанных` : undefined}
            onClick={item.id === "autofeed" ? requestAutofeedRefresh : undefined}
          >
            <span>
              <Icon aria-hidden="true" size={item.id === "autofeed" ? 25 : 22} strokeWidth={active ? 2.4 : 1.8} />
              {item.id === "favorites" && favoriteCount > 0 && <i>{Math.min(favoriteCount, 99)}</i>}
              {item.id === "messages" && unreadMessageCount > 0 && <i>{formatBadgeCount(unreadMessageCount)}</i>}
            </span>
            <small>{item.label}</small>
          </a>
        );
      })}
    </nav>
  );
}
