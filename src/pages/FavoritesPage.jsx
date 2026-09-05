import { Heart } from "lucide-react";
import { Catalog } from "../components/Catalog.jsx";

export function FavoritesPage({ favorites, listings, onFavoriteToggle }) {
  const favoriteListings = listings.filter((listing) => favorites.has(listing.id));

  return (
    <main className="favorites-page">
      <header>
        <p className="eyebrow">Ваш выбор</p>
        <h1>Избранное</h1>
      </header>
      {favoriteListings.length ? (
        <Catalog
          favorites={favorites}
          listings={favoriteListings}
          onFavoriteToggle={onFavoriteToggle}
          onSortChange={() => undefined}
          sort="recommended"
        />
      ) : (
        <section className="favorites-empty">
          <Heart size={36} strokeWidth={1.5} />
          <strong>Сохранённых автомобилей пока нет</strong>
          <p>Нажимайте на сердце в каталоге или Автоленте.</p>
          <a href="#/">Перейти к автомобилям</a>
        </section>
      )}
    </main>
  );
}
