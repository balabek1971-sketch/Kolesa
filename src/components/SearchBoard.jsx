import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, SlidersHorizontal } from "lucide-react";
import { loadVehicleCatalog } from "../lib/vehicleCatalog.js";
import { AdvancedFilters } from "./AdvancedFilters.jsx";
import { BrandPicker } from "./BrandPicker.jsx";
import { CityPicker } from "./CityPicker.jsx";
import { OptionPicker } from "./OptionPicker.jsx";

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

        <div className="select-field location-field">
          <span>Город</span>
          <CityPicker value={filters.city} onChange={(city) => onChange({ city })} />
        </div>

        <a className="show-results" href="#catalog">
          <span>Искать</span>
          <i aria-hidden="true">›</i>
          <small>{resultCount.toLocaleString("ru-KZ")} авто</small>
        </a>
      </div>

      <button
        className="advanced-toggle"
        type="button"
        aria-expanded={advancedOpen}
        onClick={() => setAdvancedOpen((current) => !current)}
      >
        <SlidersHorizontal aria-hidden="true" size={19} strokeWidth={1.6} />
        <span>Расширенный поиск</span>
        {advancedOpen
          ? <ChevronUp aria-hidden="true" size={16} />
          : <ChevronDown aria-hidden="true" size={16} />}
      </button>

      {advancedOpen && <AdvancedFilters filters={filters} onChange={onChange} />}
    </section>
  );
}
