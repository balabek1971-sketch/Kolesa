import { models, quickBrands, quickCities } from "../data/listings.js";

export function SearchBoard({ filters, onChange, resultCount }) {
  return (
    <section className="search-board" aria-label="Поиск объявлений">
      <h1>Выбирайте автомобиль по-своему</h1>

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

        <label className="select-field location-field">
          <span>Город</span>
          <select value={filters.city} onChange={(event) => onChange({ city: event.target.value })}>
            <option value="">Весь Казахстан</option>
            {quickCities.map((city) => <option key={city} value={city}>{city}</option>)}
          </select>
        </label>

        <button className="location-chip" type="button" onClick={() => onChange({ city: "Алматы" })}>
          <span aria-hidden="true">●</span>
          Алматы, KZ
        </button>

        <a className="show-results" href="#catalog">
          Искать <span aria-hidden="true">›</span>
          <small>{resultCount.toLocaleString("ru-KZ")}</small>
        </a>
      </div>
    </section>
  );
}
