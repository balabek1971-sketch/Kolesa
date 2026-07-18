import { models, quickBrands, quickCities } from "../data/listings.js";

export function SearchBoard({ filters, onChange, resultCount }) {
  return (
    <section className="search-board" aria-label="Поиск объявлений">
      <h1>Найдите свой автомобиль</h1>

      <div className="primary-filters">
        <label className="select-field">
          <span>Марка</span>
          <select value={filters.brand} onChange={(event) => onChange({ brand: event.target.value, model: "" })}>
            <option value="">Выберите марку</option>
            {quickBrands.map((brand) => <option key={brand} value={brand}>{brand}</option>)}
          </select>
        </label>

        <label className="select-field">
          <span>Модель</span>
          <select value={filters.model} onChange={(event) => onChange({ model: event.target.value })}>
            <option value="">Выберите модель</option>
            {models
              .filter((model) => !filters.brand || model.brand === filters.brand)
              .map((model) => <option key={model.name} value={model.name}>{model.name}</option>)}
          </select>
        </label>

        <label className="select-field distance-field">
          <span>Радиус</span>
          <select value={filters.radius} onChange={(event) => onChange({ radius: event.target.value })}>
            <option value="25">25 км</option>
            <option value="50">50 км</option>
            <option value="100">100 км</option>
            <option value="250">250 км</option>
            <option value="500">Весь Казахстан</option>
          </select>
        </label>

        <label className="select-field location-field">
          <span>Город</span>
          <span className="location-control">
            <i className="pin-icon" aria-hidden="true" />
            <select value={filters.city} onChange={(event) => onChange({ city: event.target.value })}>
              <option value="">Весь Казахстан</option>
              {quickCities.map((city) => <option key={city} value={city}>{city}</option>)}
            </select>
            <i className="location-valid" aria-label="Город определен">✓</i>
          </span>
        </label>

        <a className="show-results" href="#catalog">
          <span>Искать</span>
          <i aria-hidden="true">›</i>
          <small>{resultCount.toLocaleString("ru-KZ")} авто</small>
        </a>
      </div>
    </section>
  );
}
