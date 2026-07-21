import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, SlidersHorizontal } from "lucide-react";
import { quickCities } from "../data/listings.js";
import { loadVehicleCatalog } from "../lib/vehicleCatalog.js";
import { AdvancedFilters } from "./AdvancedFilters.jsx";
import { BrandPicker } from "./BrandPicker.jsx";
import { OptionPicker } from "./OptionPicker.jsx";
import { GroupedNumberInput } from "./controls/GroupedNumberInput.jsx";

export function SearchBoard({ filters, onChange, resultCount }) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [catalogState, setCatalogState] = useState({
    brand: "",
    catalog: null,
    error: false,
    loading: false,
  });

  useEffect(() => {
    if (!filters.brand) {
      setCatalogState({ brand: "", catalog: null, error: false, loading: false });
      return undefined;
    }

    let active = true;
    setCatalogState({ brand: filters.brand, catalog: null, error: false, loading: true });
    loadVehicleCatalog(filters.brand)
      .then((catalog) => {
        if (active) setCatalogState({ brand: filters.brand, catalog, error: false, loading: false });
      })
      .catch(() => {
        if (active) setCatalogState({ brand: filters.brand, catalog: null, error: true, loading: false });
      });

    return () => {
      active = false;
    };
  }, [filters.brand]);

  const catalog = catalogState.brand === filters.brand ? catalogState.catalog : null;
  const models = catalog?.models || [];

  const modelOptions = useMemo(() => models.map((model) => ({
    label: model.name,
    value: model.name,
  })), [models]);

  return (
    <section className={`search-board${advancedOpen ? " expanded" : ""}`} aria-label="Поиск объявлений">
      <h1>Найдите свой автомобиль</h1>

      <div className="primary-filters">
        <div className="select-field">
          <span>Марка</span>
          <BrandPicker
            value={filters.brand}
            onChange={(brand) => onChange({ brand, model: "" })}
          />
        </div>

        <div className="select-field">
          <span>Модель</span>
          <OptionPicker
            disabled={!filters.brand}
            emptyMessage={catalogState.error
              ? "Не удалось загрузить справочник"
              : "Для этой марки модели пока не добавлены"}
            label={`Модель ${filters.brand || ""}`}
            groupByInitial
            loading={catalogState.loading}
            onChange={(model) => onChange({ model })}
            options={modelOptions}
            placeholder={filters.brand ? "Любая модель" : "Сначала марка"}
            value={filters.model}
          />
        </div>

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
          <GroupedNumberInput
            placeholder="5 000 000"
            value={filters.priceFrom}
            onValueChange={(priceFrom) => onChange({ priceFrom })}
          />
        </label>

        <label className="select-field">
          <span>Цена до, ₸</span>
          <GroupedNumberInput
            placeholder="20 000 000"
            value={filters.priceTo}
            onValueChange={(priceTo) => onChange({ priceTo })}
          />
        </label>

        <label className="select-field mileage-field">
          <span>Пробег до, км</span>
          <GroupedNumberInput
            placeholder="100 000"
            value={filters.mileageTo}
            onValueChange={(mileageTo) => onChange({ mileageTo })}
          />
        </label>
      </div>

      <button
        className="advanced-toggle"
        type="button"
        aria-expanded={advancedOpen}
        onClick={() => setAdvancedOpen((current) => !current)}
      >
        <SlidersHorizontal aria-hidden="true" size={19} strokeWidth={1.9} />
        <span>Расширенный поиск</span>
        {advancedOpen
          ? <ChevronUp aria-hidden="true" size={16} />
          : <ChevronDown aria-hidden="true" size={16} />}
      </button>

      {advancedOpen && <AdvancedFilters filters={filters} onChange={onChange} />}
    </section>
  );
}
