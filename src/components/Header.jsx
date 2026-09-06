import { ChevronDown, Heart, UserRound } from "lucide-react";
import { requestAutofeedRefresh } from "../lib/autofeedState.js";

function formatBadgeCount(count) {
  return count > 99 ? "99+" : count;
}

export function Header({ favoriteCount, unreadMessageCount }) {
  return (
    <header className="site-header">
      <div className="header-inner">
		<a className="header-brand" href="#/" aria-label="QazAuto">
          <img className="header-logo" src="/qazauto-logo.png" alt="" />
        </a>

        <nav className="nav" aria-label="Основная навигация">
		  <a href="#/">Купить машину</a>
		  <a href="#/autofeed" onClick={requestAutofeedRefresh}>Автолента</a>
		  <a
			className="nav-message-link"
			href="#/messages"
			aria-label={`Сообщения: ${unreadMessageCount} непрочитанных`}
		  >
			Сообщения
			{unreadMessageCount > 0 && <i>{formatBadgeCount(unreadMessageCount)}</i>}
		  </a>
          <a href="#/sell">Продать машину</a>
        </nav>

        <div className="header-actions">
		  <a className="header-icon favorite-summary" href="#/favorites" aria-label={`Избранное: ${favoriteCount}`}>
            <Heart aria-hidden="true" size={20} strokeWidth={1.7} />
		  </a>
          <a className="header-icon profile-button" href="#/account" aria-label="Личный кабинет">
            <UserRound aria-hidden="true" size={20} strokeWidth={1.7} />
            <ChevronDown aria-hidden="true" size={15} strokeWidth={1.8} />
          </a>
        </div>
      </div>
    </header>
  );
}
