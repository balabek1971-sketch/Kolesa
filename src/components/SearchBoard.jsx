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

      <div className="secondary-filters">
        <label className="select-field">
          <span>Состояние</span>
          <select value={filters.condition} onChange={(event) => onChange({ condition: event.target.value })}>
            <option value="">Все автомобили</option>
            <option value="new">Новые</option>
            <option value="used">С пробегом</option>
          </select>
        </label>

        <label className="select-field">
          <span>Год от</span>
          <input
            type="number"
            min="1950"
            max="2026"
            placeholder="2015"
            value={filters.yearFrom}
            onChange={(event) => onChange({ yearFrom: event.target.value })}
          />
        </label>

        <label className="select-field">
          <span>Год до</span>
          <input
            type="number"
            min="1950"
            max="2026"
            placeholder="2026"
            value={filters.yearTo}
            onChange={(event) => onChange({ yearTo: event.target.value })}
          />
        </label>

        <label className="select-field">
          <span>Цена от, ₸</span>
          <input
            type="number"
            min="0"
            step="100000"
            placeholder="5 000 000"
            value={filters.priceFrom}
            onChange={(event) => onChange({ priceFrom: event.target.value })}
          />
        </label>

        <label className="select-field">
          <span>Цена до, ₸</span>
          <input
            type="number"
            min="0"
            step="100000"
            placeholder="20 000 000"
            value={filters.priceTo}
            onChange={(event) => onChange({ priceTo: event.target.value })}
          />
        </label>

        <label className="select-field mileage-field">
          <span>Пробег до, км</span>
          <input
            type="number"
            min="0"
            step="1000"
            placeholder="100 000"
            value={filters.mileageTo}
            onChange={(event) => onChange({ mileageTo: event.target.value })}
          />
        </label>
      </div>
    </section>
  );
}
