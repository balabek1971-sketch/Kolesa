export function Header({ favoriteCount }) {
  return (
    <header className="site-header">
      <div className="header-inner">
        <a className="header-brand" href="#top" aria-label="QazAuto">
          <span className="brand-mark">Q</span>
          <span>QazAuto</span>
        </a>

        <nav className="nav" aria-label="Основная навигация">
          <a href="#catalog">Купить машину</a>
          <a href="#sell">Продать машину</a>
        </nav>

        <div className="header-actions">
          <button className="city-button" type="button">
            Алматы
            <span className="city-chevron" aria-hidden="true">⌄</span>
          </button>
          <button className="header-icon favorite-summary" type="button" aria-label={`Избранное: ${favoriteCount}`}>
            <span aria-hidden="true">♡</span>
            <b>{favoriteCount}</b>
          </button>
          <button className="header-icon profile-button" type="button" aria-label="Личный кабинет">
            <span className="profile-glyph" aria-hidden="true" />
            <span className="profile-chevron" aria-hidden="true">⌄</span>
          </button>
        </div>
      </div>
    </header>
  );
}
