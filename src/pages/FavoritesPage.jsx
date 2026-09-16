import { useEffect, useMemo, useState } from "react";
import { Heart } from "lucide-react";
import { Catalog } from "../components/Catalog.jsx";
import { fetchListingsByIds } from "../lib/supabase.js";

export function FavoritesPage({ authenticated, favorites, listings, onFavoriteToggle }) {
  const favoritesKey = useMemo(() => [...favorites].sort().join(","), [favorites]);
  const [favoriteListings, setFavoriteListings] = useState(() => listings.filter((listing) => favorites.has(listing.id)));
  const [loading, setLoading] = useState(favorites.size > 0);

  useEffect(() => {
    if (!favorites.size) {
      setFavoriteListings([]);
      setLoading(false);
      return undefined;
    }
    let active = true;
    setLoading(true);
    fetchListingsByIds([...favorites])
      .then((items) => {
        if (active) setFavoriteListings(items);
      })
      .catch((error) => console.error("Не удалось загрузить избранные объявления", error))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [favoritesKey]);

  return (
    <main className="favorites-page">
      <header>
        <p className="eyebrow">Ваш выбор</p>
        <h1>Избранное</h1>
      </header>
      {loading || favoriteListings.length ? (
        <Catalog
          authenticated={authenticated}
          favorites={favorites}
          listings={favoriteListings}
          loading={loading}
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
