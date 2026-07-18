import { categories, quickBrands, quickCities } from "../data/listings.js";
import { RangeInput } from "./controls/RangeInput.jsx";
import { ToggleCheck } from "./controls/ToggleCheck.jsx";

export function SearchBoard({ filters, onChange, onReset, resultCount }) {
  return (
    <section className="search-board" aria-label="Поиск объявлений">
      <div className="search-board-topline">
        <div>
          <p className="search-kicker">Поиск по рынку</p>
          <h2>Найдите автомобиль под себя</h2>
        </div>
        <button className="reset-button" type="button" onClick={onReset}>Сбросить</button>
      </div>

      <div className="category-tabs" role="group" aria-label="Категория транспорта">
        {categories.map((category) => (
          <button
            className={filters.category === category.id ? "category-tab active" : "category-tab"}
            key={category.id}
            type="button"
            onClick={() => onChange({ category: category.id })}
          >
            {category.label}
          </button>
        ))}
      </div>

      <div className="primary-filters">
        <label className="select-field">
          <span>Марка</span>
          <select value={filters.brand} onChange={(event) => onChange({ brand: event.target.value })}>
            <option value="">Любая марка</option>
            {quickBrands.map((brand) => <option key={brand} value={brand}>{brand}</option>)}
          </select>
        </label>

        <label className="select-field">
          <span>Город</span>
          <select value={filters.city} onChange={(event) => onChange({ city: event.target.value })}>
            <option value="">Весь Казахстан</option>
            {quickCities.map((city) => <option key={city} value={city}>{city}</option>)}
          </select>
        </label>

        <RangeInput
          label="Год выпуска"
          from={filters.yearFrom}
          to={filters.yearTo}
          onFrom={(yearFrom) => onChange({ yearFrom })}
          onTo={(yearTo) => onChange({ yearTo })}
        />

        <RangeInput
          label="Цена, ₸"
          from={filters.priceFrom}
          to={filters.priceTo}
          onFrom={(priceFrom) => onChange({ priceFrom })}
          onTo={(priceTo) => onChange({ priceTo })}
        />

        <a className="show-results" href="#catalog">
          Смотреть {resultCount.toLocaleString("ru-KZ")}
        </a>
      </div>

      <div className="search-board-bottom">
        <div className="condition-switch" role="group" aria-label="Состояние авто">
          {[
            ["", "Все авто"],
            ["new", "Новые"],
            ["used", "С пробегом"]
          ].map(([value, label]) => (
            <button
              className={filters.condition === value ? "active" : ""}
              key={label}
              type="button"
              onClick={() => onChange({ condition: value })}
            >
              {label}
            </button>
          ))}
        </div>

        <details className="more-filters">
          <summary>Больше фильтров</summary>
          <div className="advanced-filter-grid">
            <ToggleCheck checked={filters.hasPhoto} label="Только с фото" onChange={(hasPhoto) => onChange({ hasPhoto })} />
            <ToggleCheck checked={filters.hasHistory} label="С историей авто" onChange={(hasHistory) => onChange({ hasHistory })} />
            <ToggleCheck checked={filters.cleared} label="Растаможенные" onChange={(cleared) => onChange({ cleared })} />
            <ToggleCheck checked={filters.damaged} label="Аварийные / не на ходу" onChange={(damaged) => onChange({ damaged })} />
            <ToggleCheck checked={filters.canFinance} label="Доступны в кредит" onChange={(canFinance) => onChange({ canFinance })} />
          </div>
        </details>
      </div>
    </section>
  );
}
