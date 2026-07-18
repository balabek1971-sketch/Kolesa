export function Header({ favoriteCount }) {
  return (
    <header className="site-header">
      <div className="header-inner">
        <a className="header-brand" href="#top" aria-label="QazAuto">
          <span className="brand-mark">Q</span>
          <span>QazAuto</span>
        </a>

        <nav className="nav" aria-label="Основная навигация">
          <a href="#catalog">Автомобили</a>
          <a href="#sell">Продать авто</a>
          <a href="#insights">Обзоры</a>
          <a href="#insights">Для дилеров</a>
        </nav>

        <div className="header-actions">
          <button className="region-code" type="button" aria-label="Почтовый индекс 050000">
            <span className="pin-icon" aria-hidden="true" />
            <span><small>Индекс</small>050000</span>
          </button>
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
