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
  loading,
  loadingMore,
  onFavoriteToggle,
  onFiltersChange,
  onLoadMore,
  onSortChange,
  resultCount,
  sort,
}) {
  return (
    <main>
      <section className="hero-shell" id="top">
        <div className="hero-content">
          <SearchBoard
            filters={filters}
            onChange={onFiltersChange}
            resultCount={resultCount}
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
        loading={loading}
        loadingMore={loadingMore}
        favorites={favorites}
        onFiltersChange={onFiltersChange}
        onLoadMore={onLoadMore}
        resultCount={resultCount}
        sort={sort}
        onSortChange={onSortChange}
        onFavoriteToggle={onFavoriteToggle}
      />
    </main>
  );
}
