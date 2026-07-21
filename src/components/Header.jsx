import { ChevronDown, Heart, UserRound } from "lucide-react";

export function Header({ favoriteCount }) {
  return (
    <header className="site-header">
      <div className="header-inner">
        <a className="header-brand" href="#top" aria-label="QazAuto">
          <img className="header-logo" src="/qazauto-logo.png" alt="" />
        </a>

        <nav className="nav" aria-label="Основная навигация">
          <a href="#catalog">Купить машину</a>
          <a href="#/sell">Продать машину</a>
        </nav>

        <div className="header-actions">
          <button className="city-button" type="button">
            Алматы
            <span className="city-chevron" aria-hidden="true">⌄</span>
          </button>
          <button className="header-icon favorite-summary" type="button" aria-label={`Избранное: ${favoriteCount}`}>
            <Heart aria-hidden="true" size={20} strokeWidth={1.7} />
          </button>
          <a className="header-icon profile-button" href="#/account" aria-label="Личный кабинет">
            <UserRound aria-hidden="true" size={20} strokeWidth={1.7} />
            <ChevronDown aria-hidden="true" size={15} strokeWidth={1.8} />
          </a>
        </div>
      </div>
    </header>
  );
}
