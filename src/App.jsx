import { useMemo, useState } from "react";
import { Header } from "./components/Header.jsx";
import { SearchBoard } from "./components/SearchBoard.jsx";
import { Catalog } from "./components/Catalog.jsx";
import { SellForm } from "./components/SellForm.jsx";
import { MarketInsights } from "./components/MarketInsights.jsx";
import { initialListings } from "./data/listings.js";
import { createDefaultFilters, filterListings, sortListings } from "./lib/search.js";

export function App() {
  const [filters, setFilters] = useState(createDefaultFilters);
  const [sort, setSort] = useState("recommended");
  const [listings, setListings] = useState(initialListings);
  const [favorites, setFavorites] = useState(() => new Set());

  const visibleListings = useMemo(() => {
    return sortListings(filterListings(listings, filters), sort);
  }, [filters, listings, sort]);

  function patchFilters(patch) {
    setFilters((current) => ({ ...current, ...patch }));
  }

  function resetFilters() {
    setFilters(createDefaultFilters());
  }

  function toggleFavorite(id) {
    setFavorites((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function addListing(listing) {
    setListings((current) => [listing, ...current]);
  }

  return (
    <>
      <Header favoriteCount={favorites.size} />
      <main>
        <section className="hero-shell" id="top">
          <div className="hero-content">
            <SearchBoard
              filters={filters}
              onChange={patchFilters}
              onReset={resetFilters}
              resultCount={visibleListings.length}
            />

            <div className="hero-copy">
              <p className="eyebrow">Автомобили по Казахстану</p>
              <h1>Своя дорога начинается здесь.</h1>
              <p>
                Новые и проверенные автомобили от частных продавцов и дилеров. Выбирайте город,
                марку и параметры - остальное найдём.
              </p>
            </div>

            <div className="market-ribbon" aria-label="Преимущества QazAuto">
              <span>Объявления со всего Казахстана</span>
              <span>Проверка истории авто</span>
              <span>Помощь с кредитом</span>
            </div>
          </div>
        </section>

        <Catalog
          listings={visibleListings}
          favorites={favorites}
          sort={sort}
          onSortChange={setSort}
          onFavoriteToggle={toggleFavorite}
        />

        <MarketInsights listings={listings} />
        <SellForm onSubmit={addListing} />
      </main>
    </>
  );
}
