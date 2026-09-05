import { ChevronDown, Heart, UserRound } from "lucide-react";

export function Header({ favoriteCount }) {
  return (
    <header className="site-header">
      <div className="header-inner">
		<a className="header-brand" href="#/" aria-label="QazAuto">
          <img className="header-logo" src="/qazauto-logo.png" alt="" />
        </a>

        <nav className="nav" aria-label="Основная навигация">
		  <a href="#/">Купить машину</a>
		  <a href="#/autofeed">Автолента</a>
		  <a href="#/messages">Сообщения</a>
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
