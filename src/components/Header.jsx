export function Header({ favoriteCount }) {
  return (
    <header className="site-header">
      <div className="header-inner">
        <nav className="nav" aria-label="Основная навигация">
          <a href="#catalog">Автомобили</a>
          <a href="#sell">Продать авто</a>
          <a href="#insights">Для дилеров</a>
        </nav>

        <a className="header-brand" href="#top" aria-label="QazAuto">
          <span className="brand-mark">Q</span>
          <span>QazAuto</span>
        </a>

        <div className="header-actions">
          <button className="city-button" type="button">Алматы</button>
          <button className="favorite-summary" type="button" aria-label="Избранное">
            <span aria-hidden="true">♡</span>
            <b>{favoriteCount}</b>
          </button>
        </div>
      </div>
    </header>
  );
}
