import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { filterListings } from "../lib/search.js";
import { loadVehicleCatalog } from "../lib/vehicleCatalog.js";
import { AdvancedFilters } from "./AdvancedFilters.jsx";
import { BrandPicker } from "./BrandPicker.jsx";
import { CityPicker } from "./CityPicker.jsx";
import { OptionPicker } from "./OptionPicker.jsx";

export function CatalogFiltersDialog({ filters, listings, onApply, onClose }) {
  const [draftFilters, setDraftFilters] = useState(() => ({ ...filters }));
  const [catalogState, setCatalogState] = useState({
    brand: "",
    catalog: null,
    error: false,
    loading: false,
  });

  useEffect(() => {
    function handleKeyDown(event) {
      const nestedPickerOpen = document.querySelector(
        ".brand-picker-overlay, .option-picker-overlay, .city-picker-overlay",
      );
      if (event.key === "Escape" && !nestedPickerOpen) onClose();
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    if (!draftFilters.brand) {
      setCatalogState({ brand: "", catalog: null, error: false, loading: false });
      return undefined;
    }

    let active = true;
    setCatalogState({ brand: draftFilters.brand, catalog: null, error: false, loading: true });
    loadVehicleCatalog(draftFilters.brand)
      .then((catalog) => {
        if (active) setCatalogState({ brand: draftFilters.brand, catalog, error: false, loading: false });
      })
      .catch(() => {
        if (active) setCatalogState({ brand: draftFilters.brand, catalog: null, error: true, loading: false });
      });

    return () => {
      active = false;
    };
  }, [draftFilters.brand]);

  const catalog = catalogState.brand === draftFilters.brand ? catalogState.catalog : null;
  const modelOptions = useMemo(() => (catalog?.models || []).map((model) => ({
    label: model.name,
    value: model.name,
  })), [catalog]);
  const resultCount = useMemo(
    () => filterListings(listings, draftFilters).length,
    [draftFilters, listings],
  );

  function patchFilters(patch) {
    setDraftFilters((current) => ({ ...current, ...patch }));
  }

  function applyFilters() {
    onApply(draftFilters);
    onClose();
  }

  return createPortal(
    <div className="catalog-filter-overlay">
      <section className="catalog-filter-dialog" role="dialog" aria-modal="true" aria-labelledby="catalog-filter-title">
        <header className="catalog-filter-header">
          <div>
            <button type="button" aria-label="Назад к объявлениям" onClick={onClose}>
              <ArrowLeft aria-hidden="true" size={22} />
            </button>
            <span>
              <small>Каталог</small>
              <h2 id="catalog-filter-title">Фильтр</h2>
            </span>
          </div>
        </header>

        <div className="catalog-filter-scroll">
          <div className="catalog-filter-primary">
            <div className="select-field catalog-filter-field">
              <span>Марка</span>
              <BrandPicker
                value={draftFilters.brand}
                onChange={(brand) => patchFilters({ brand, model: "" })}
              />
            </div>

            <div className="select-field catalog-filter-field">
              <span>Модель</span>
              <OptionPicker
                disabled={!draftFilters.brand}
                emptyMessage={catalogState.error
                  ? "Не удалось загрузить справочник"
                  : "Для этой марки модели пока не добавлены"}
                groupByInitial
                label={`Модель ${draftFilters.brand || ""}`}
                loading={catalogState.loading}
                onChange={(model) => patchFilters({ model })}
                options={modelOptions}
                placeholder={draftFilters.brand ? "Любая модель" : "Сначала марка"}
                value={draftFilters.model}
              />
            </div>

            <div className="select-field catalog-filter-field location-field">
              <span>Город</span>
              <CityPicker value={draftFilters.city} onChange={(city) => patchFilters({ city })} />
            </div>
          </div>

          <AdvancedFilters filters={draftFilters} onChange={patchFilters} />

          <button className="catalog-filter-submit" type="button" onClick={applyFilters}>
            <span>Искать</span>
            <ArrowRight aria-hidden="true" size={20} />
            <small>{resultCount.toLocaleString("ru-KZ")} авто</small>
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
