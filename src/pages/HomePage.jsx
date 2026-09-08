import { Catalog } from "../components/Catalog.jsx";
import { PopularBrowse } from "../components/PopularBrowse.jsx";
import { PopularModels } from "../components/PopularModels.jsx";
import { SearchBoard } from "../components/SearchBoard.jsx";

export function HomePage({
  allListings,
  authenticated,
  favorites,
  filters,
  listings,
  onFavoriteToggle,
  onFiltersChange,
  onSortChange,
  sort
}) {
  return (
    <main>
      <section className="hero-shell" id="top">
        <div className="hero-content">
          <SearchBoard
            filters={filters}
            onChange={onFiltersChange}
            resultCount={listings.length}
          />
        </div>
      </section>

      <PopularBrowse filters={filters} onChange={onFiltersChange} />

      <PopularModels onChange={onFiltersChange} />

      <Catalog
        allListings={allListings}
        authenticated={authenticated}
        filters={filters}
        listings={listings}
        favorites={favorites}
        onFiltersChange={onFiltersChange}
        sort={sort}
        onSortChange={onSortChange}
        onFavoriteToggle={onFavoriteToggle}
      />
    </main>
  );
}
