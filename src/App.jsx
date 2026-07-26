import { useEffect, useMemo, useState } from "react";
import { Header } from "./components/Header.jsx";
import { AccountPage } from "./pages/AccountPage.jsx";
import { HomePage } from "./pages/HomePage.jsx";
import { SellPage } from "./pages/SellPage.jsx";
import { initialListings } from "./data/listings.js";
import { useAuth } from "./hooks/useAuth.js";
import { mediaApiConfigured, uploadListingMedia } from "./lib/mediaApi.js";
import { createDefaultFilters, filterListings, sortListings } from "./lib/search.js";
import {
  createListing,
  fetchListings,
  publishListing,
  supabase
} from "./lib/supabase.js";

function getRoute() {
  const hash = window.location.hash;
  if (hash.startsWith("#/sell")) return "sell";
  if (hash.startsWith("#/account")) return "account";
  return "home";
}

export function App() {
  const [route, setRoute] = useState(getRoute);
  const [filters, setFilters] = useState(createDefaultFilters);
  const [sort, setSort] = useState("recommended");
  const [listings, setListings] = useState(initialListings);
  const [favorites, setFavorites] = useState(() => new Set());
  const auth = useAuth();

  useEffect(() => {
    const handleRouteChange = () => setRoute(getRoute());
    window.addEventListener("hashchange", handleRouteChange);
    return () => window.removeEventListener("hashchange", handleRouteChange);
  }, []);

  useEffect(() => {
    if (!supabase) return undefined;

    let active = true;
    fetchListings()
      .then((remoteListings) => {
        if (active && remoteListings.length > 0) setListings(remoteListings);
      })
      .catch((error) => {
        console.error("Не удалось загрузить объявления из Supabase", error);
      });

    return () => {
      active = false;
    };
  }, []);

  const visibleListings = useMemo(() => {
    return sortListings(filterListings(listings, filters), sort);
  }, [filters, listings, sort]);

  function patchFilters(patch) {
    setFilters((current) => ({ ...current, ...patch }));
  }

  function toggleFavorite(id) {
    setFavorites((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function addListing(listing, onMediaProgress, options = {}) {
    if (!supabase || !auth.session) {
      throw new Error("Для сохранения объявления необходимо войти в аккаунт.");
    }
    if ((listing.photos.length || listing.video) && !mediaApiConfigured) {
      throw new Error("Сервис загрузки фото и видео ещё не подключён.");
    }
    const listingId = await createListing(listing);

    if ((listing.photos.length || listing.video) && mediaApiConfigured) {
      await uploadListingMedia({
        accessToken: auth.session.access_token,
        listingId,
        photos: listing.photos,
        video: listing.video,
        onProgress: onMediaProgress,
      });
    }

    if (options.publish) {
      await publishListing(listingId);
    }

    return listingId;
  }

  let page;
  if (route === "sell") {
    page = <SellPage auth={auth} onSubmit={addListing} />;
  } else if (route === "account") {
    page = <AccountPage auth={auth} />;
  } else {
    page = (
      <HomePage
        favorites={favorites}
        filters={filters}
        listings={visibleListings}
        onFavoriteToggle={toggleFavorite}
        onFiltersChange={patchFilters}
        onSortChange={setSort}
        sort={sort}
      />
    );
  }

  return (
    <>
      <Header favoriteCount={favorites.size} />
      {page}
    </>
  );
}
