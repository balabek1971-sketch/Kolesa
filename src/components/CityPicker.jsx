import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Search, X } from "lucide-react";
import { kazakhstanRegions } from "../data/kazakhstanLocations.js";
import { quickCities } from "../data/listings.js";

function formatLocationCount(count) {
  const lastTwoDigits = count % 100;
  const lastDigit = count % 10;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return `${count} населённых пунктов`;
  if (lastDigit === 1) return `${count} населённый пункт`;
  if (lastDigit >= 2 && lastDigit <= 4) return `${count} населённых пункта`;
  return `${count} населённых пунктов`;
}

export function CityPicker({ onChange, value }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [regionName, setRegionName] = useState("");
  const searchButtonRef = useRef(null);
  const hasCustomValue = value && !quickCities.includes(value);
  const selectedRegion = kazakhstanRegions.find((region) => region.name === regionName);

  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      searchButtonRef.current?.focus();
    };
  }, [open]);

  const searchGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ru-KZ");
    if (!normalizedQuery) return [];

    return kazakhstanRegions.flatMap((region) => {
      const regionMatches = region.name.toLocaleLowerCase("ru-KZ").includes(normalizedQuery);
      const cities = regionMatches
        ? region.cities
        : region.cities.filter((city) => city.toLocaleLowerCase("ru-KZ").includes(normalizedQuery));

      return cities.length ? [{ ...region, cities }] : [];
    });
  }, [query]);

  function openPicker() {
    setQuery("");
    setRegionName("");
    setOpen(true);
  }

  function chooseCity(city) {
    onChange(city);
    setOpen(false);
    setQuery("");
    setRegionName("");
  }

  function handleQuickChange(event) {
    if (event.target.value === "__more") {
      openPicker();
      return;
    }

    onChange(event.target.value);
  }

  return (
    <>
      <span className="location-control city-picker-control">
        <i className="pin-icon" aria-hidden="true" />
        <select aria-label="Город" value={value} onChange={handleQuickChange}>
          <option value="">Весь Казахстан</option>
          {hasCustomValue && <option value={value}>{value}</option>}
          {quickCities.map((city) => <option key={city} value={city}>{city}</option>)}
          <option value="__more">Ещё...</option>
        </select>
        <button ref={searchButtonRef} className="city-search-button" type="button" onClick={openPicker}>
          <Search aria-hidden="true" size={14} strokeWidth={2.2} />
          <span>Поиск</span>
        </button>
        <i className="location-valid" aria-label="Регион выбран">✓</i>
      </span>

      {open && createPortal(
        <div className="city-picker-overlay" role="presentation" onMouseDown={() => setOpen(false)}>
          <section
            className="city-picker-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="city-picker-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="city-picker-head">
              <div>
                <p className="eyebrow">Казахстан</p>
                <h2 id="city-picker-title">Выберите город или область</h2>
              </div>
              <button className="city-picker-close" type="button" aria-label="Закрыть" onClick={() => setOpen(false)}>
                <X aria-hidden="true" size={22} />
              </button>
            </header>

            <label className="city-picker-search">
              <Search aria-hidden="true" size={19} />
              <input
                autoFocus
                type="search"
                aria-label="Поиск города или области"
                placeholder="Найти город или область"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>

            <div className="city-picker-quick" aria-label="Популярные города">
              <button className={!value ? "active" : ""} type="button" onClick={() => chooseCity("")}>Весь Казахстан</button>
              {quickCities.map((city) => (
                <button className={value === city ? "active" : ""} key={city} type="button" onClick={() => chooseCity(city)}>
                  {city}
                </button>
              ))}
            </div>

            <div className="city-picker-content">
              {query ? (
                <div className="city-search-results">
                  {searchGroups.map((region) => (
                    <section className="city-result-group" key={region.name}>
                      <h3>{region.name}</h3>
                      <div>
                        {region.cities.map((city) => (
                          <button className={value === city ? "active" : ""} key={city} type="button" onClick={() => chooseCity(city)}>
                            {city}
                          </button>
                        ))}
                      </div>
                    </section>
                  ))}
                  {!searchGroups.length && <p className="city-picker-empty">Ничего не найдено</p>}
                </div>
              ) : selectedRegion ? (
                <div className="city-region-view">
                  <nav className="city-breadcrumb" aria-label="Навигация по регионам">
                    <button type="button" onClick={() => setRegionName("")}>Все области</button>
                    <ChevronRight aria-hidden="true" size={16} />
                    <strong>{selectedRegion.name}</strong>
                  </nav>
                  <div className="city-list">
                    {selectedRegion.cities.map((city) => (
                      <button className={value === city ? "active" : ""} key={city} type="button" onClick={() => chooseCity(city)}>
                        {city}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="region-list">
                  {kazakhstanRegions.map((region) => (
                    <button key={region.name} type="button" onClick={() => setRegionName(region.name)}>
                      <span>{region.name}</span>
                      <small>{formatLocationCount(region.cities.length)}</small>
                      <ChevronRight aria-hidden="true" size={17} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}
