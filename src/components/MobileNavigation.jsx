import { Heart, Home, MessageCircle, PlaySquare, UserRound } from "lucide-react";

const items = [
  { id: "home", label: "Главная", href: "#/", icon: Home },
  { id: "favorites", label: "Избранное", href: "#/favorites", icon: Heart },
  { id: "autofeed", label: "Автолента", href: "#/autofeed", icon: PlaySquare },
  { id: "messages", label: "Сообщения", href: "#/messages", icon: MessageCircle },
  { id: "account", label: "Профиль", href: "#/account", icon: UserRound },
];

export function MobileNavigation({ activeRoute, favoriteCount }) {
  return (
    <nav className="mobile-navigation" aria-label="Мобильная навигация">
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.id === activeRoute;
        return (
          <a className={`${item.id === "autofeed" ? "primary " : ""}${active ? "active" : ""}`} href={item.href} key={item.id} aria-current={active ? "page" : undefined}>
            <span>
              <Icon aria-hidden="true" size={item.id === "autofeed" ? 25 : 22} strokeWidth={active ? 2.4 : 1.8} />
              {item.id === "favorites" && favoriteCount > 0 && <i>{Math.min(favoriteCount, 99)}</i>}
            </span>
            <small>{item.label}</small>
          </a>
        );
      })}
    </nav>
  );
}
