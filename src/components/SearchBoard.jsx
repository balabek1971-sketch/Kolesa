import { categories, quickBrands, quickCities } from "../data/listings.js";
import { RangeInput } from "./controls/RangeInput.jsx";
import { ToggleCheck } from "./controls/ToggleCheck.jsx";

export function SearchBoard({ filters, onChange, onReset, resultCount }) {
  return (
    <section className="searchBoard" id="top" aria-label="Поиск объявлений">
      <div className="categoryTabs">
        {categories.map((category) => (
          <button
            className={filters.category === category.id ? "linkTab active" : "linkTab"}
            key={category.id}
            type="button"
            onClick={() => onChange({ category: category.id })}
          >
            {category.label}
          </button>
        ))}
      </div>

      <div className="searchLayout">
        <div className="searchLeft">
          <div className="vehicleKinds" aria-hidden="true">
            <span className="vehicle sedan" />
            <span className="vehicle suv" />
            <span className="vehicle wagon" />
          </div>

          <QuickRow
            label="Где искать"
            options={quickCities}
            value={filters.city}
            onSelect={(city) => onChange({ city })}
          />
          <QuickRow
            label="Марка"
            options={quickBrands}
            value={filters.brand}
            onSelect={(brand) => onChange({ brand })}
          />

          <div className="segmented" role="group" aria-label="Состояние авто">
            {[
              ["", "Все"],
              ["new", "Новая"],
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

          <div className="checkGrid">
            <ToggleCheck
              checked={filters.hasPhoto}
              label="С фото"
              onChange={(hasPhoto) => onChange({ hasPhoto })}
            />
            <ToggleCheck
              checked={filters.hasHistory}
              label="История авто"
              onChange={(hasHistory) => onChange({ hasHistory })}
            />
            <ToggleCheck
              checked={filters.cleared}
              label="Растаможен"
              onChange={(cleared) => onChange({ cleared })}
            />
            <ToggleCheck
              checked={filters.damaged}
              label="Аварийная/Не на ходу"
              onChange={(damaged) => onChange({ damaged })}
            />
          </div>

          <button className="advancedButton" type="button">
            <span aria-hidden="true">☷</span>
            Расширенный поиск
            <span aria-hidden="true">⌄</span>
          </button>
        </div>

        <div className="searchRight">
          <RangeInput
            label="Год выпуска"
            from={filters.yearFrom}
            to={filters.yearTo}
            onFrom={(yearFrom) => onChange({ yearFrom })}
            onTo={(yearTo) => onChange({ yearTo })}
          />
          <RangeInput
            label="Цена"
            from={filters.priceFrom}
            to={filters.priceTo}
            onFrom={(priceFrom) => onChange({ priceFrom })}
            onTo={(priceTo) => onChange({ priceTo })}
          />
          <ToggleCheck
            checked={filters.canFinance}
            label="Доступны в кредит"
            onChange={(canFinance) => onChange({ canFinance })}
          />
          <RangeInput
            label="Первоначальный взнос"
            from={filters.downPaymentFrom}
            to={filters.downPaymentTo}
            onFrom={(downPaymentFrom) => onChange({ downPaymentFrom })}
            onTo={(downPaymentTo) => onChange({ downPaymentTo })}
          />
          <RangeInput
            label="Ежемесячный платеж"
            from={filters.monthlyPaymentFrom}
            to={filters.monthlyPaymentTo}
            onFrom={(monthlyPaymentFrom) => onChange({ monthlyPaymentFrom })}
            onTo={(monthlyPaymentTo) => onChange({ monthlyPaymentTo })}
          />
        </div>
      </div>

      <div className="searchFooter">
        <button className="ghostButton" type="button" onClick={onReset}>
          Сбросить
        </button>
        <a className="showResults" href="#catalog">
          Показать {resultCount.toLocaleString("ru-KZ")} объявлений
        </a>
      </div>
    </section>
  );
}

function QuickRow({ label, options, value, onSelect }) {
  return (
    <div className="quickRow">
      <button className="quickLabel" type="button" onClick={() => onSelect("")}>
        {label}
      </button>
      {options.map((option) => (
        <button
          className={value === option ? "quickLink selected" : "quickLink"}
          key={option}
          type="button"
          onClick={() => onSelect(value === option ? "" : option)}
        >
          {option}
        </button>
      ))}
      <button className="quickLink more" type="button">
        ещё⌄
      </button>
    </div>
  );
}
