export function Header({ favoriteCount }) {
  return (
    <header className="topbar">
      <a className="brand" href="#top" aria-label="QazAuto Market">
        <span className="brandMark">Q</span>
        <span>
          <strong>QazAuto</strong>
          <small>Market</small>
        </span>
      </a>
      <nav className="nav" aria-label="Основная навигация">
        <a href="#catalog">Каталог</a>
        <a href="#sell">Продать авто</a>
        <a href="#insights">Аналитика</a>
      </nav>
      <button className="favoriteSummary" type="button" aria-label="Избранное">
        <span aria-hidden="true">♡</span>
        <b>{favoriteCount}</b>
      </button>
    </header>
  );
}
