import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Header } from "./components/Header.jsx";
import { MobileNavigation } from "./components/MobileNavigation.jsx";
import { CookieConsent } from "./components/CookieConsent.jsx";
import { AccountPage } from "./pages/AccountPage.jsx";
import { HomePage } from "./pages/HomePage.jsx";
import { ListingPage } from "./pages/ListingPage.jsx";
import { SellPage } from "./pages/SellPage.jsx";
import { FavoritesPage } from "./pages/FavoritesPage.jsx";
import { initialListings } from "./data/listings.js";
import { useAuth } from "./hooks/useAuth.js";
import { mediaApiConfigured, uploadListingMedia } from "./lib/mediaApi.js";
import { createDefaultFilters, filterListings, sortListings } from "./lib/search.js";
import { trackBehavior } from "./lib/analytics.js";
import {
  createListing,
  fetchListings,
	  fetchFavoriteIds,
  publishListing,
	  setFavorite,
  supabase
} from "./lib/supabase.js";

const AutofeedPage = lazy(() => import("./pages/AutofeedPage.jsx").then((module) => ({ default: module.AutofeedPage })));
const MessagesPage = lazy(() => import("./pages/MessagesPage.jsx").then((module) => ({ default: module.MessagesPage })));

function getRoute() {
  const hash = window.location.hash;
  const listingMatch = hash.match(/^#\/cars\/([^/?#]+)/);
  if (listingMatch) return { name: "listing", listingId: decodeURIComponent(listingMatch[1]) };
  if (hash.startsWith("#/sell")) return { name: "sell" };
  if (hash.startsWith("#/account")) return { name: "account" };
	if (hash.startsWith("#/favorites")) return { name: "favorites" };
	if (hash.startsWith("#/autofeed")) return { name: "autofeed" };
	const messageMatch = hash.match(/^#\/messages(?:\/([^/?#]+))?/);
	if (messageMatch) return { name: "messages", conversationId: messageMatch[1] ? decodeURIComponent(messageMatch[1]) : "" };
  return { name: "home" };
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
		if (route.name !== "listing") return undefined;
		const started = performance.now();
		trackBehavior("open", { listingId: route.listingId, metadata: { source: "listing_page" } });
		return () => {
			const duration = Math.round(performance.now() - started);
			trackBehavior("active_view", { listingId: route.listingId, activeMilliseconds: duration, metadata: { source: "listing_page" } });
			if (duration >= 3000) trackBehavior("qualified_view", { listingId: route.listingId, activeMilliseconds: duration });
		};
	}, [route]);

	useEffect(() => {
		if (!auth.session) {
			setFavorites(new Set());
			return undefined;
		}
		let active = true;
		fetchFavoriteIds()
			.then((ids) => {
				if (active) setFavorites(new Set(ids));
			})
			.catch((error) => console.error("Не удалось загрузить избранное", error));
		return () => { active = false; };
	}, [auth.session]);

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
		if (["brand", "model", "body", "city"].some((field) => Object.prototype.hasOwnProperty.call(patch, field))) {
			trackBehavior("search", { metadata: { ...filters, ...patch, source: "catalog" } });
		}
  }

	async function toggleFavorite(id) {
		if (!auth.session) {
			window.location.hash = "/account";
			return;
		}
		const nextFavorite = !favorites.has(id);
    setFavorites((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
		try {
			await setFavorite(id, nextFavorite);
			trackBehavior(nextFavorite ? "favorite" : "unfavorite", { listingId: id });
		} catch (error) {
			setFavorites((current) => {
				const next = new Set(current);
				nextFavorite ? next.delete(id) : next.add(id);
				return next;
			});
			console.error("Не удалось обновить избранное", error);
		}
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
  if (route.name === "sell") {
    page = <SellPage auth={auth} onSubmit={addListing} />;
  } else if (route.name === "account") {
    page = <AccountPage auth={auth} />;
  } else if (route.name === "listing") {
    const fallbackListing = listings.find((listing) => listing.id === route.listingId);
    page = (
      <ListingPage
        fallbackListing={fallbackListing}
        favorite={favorites.has(route.listingId)}
        listingId={route.listingId}
        onFavoriteToggle={toggleFavorite}
		auth={auth}
      />
    );
	} else if (route.name === "autofeed") {
		page = <AutofeedPage auth={auth} favorites={favorites} onFavoriteToggle={toggleFavorite} />;
	} else if (route.name === "favorites") {
		page = <FavoritesPage favorites={favorites} listings={listings} onFavoriteToggle={toggleFavorite} />;
	} else if (route.name === "messages") {
		page = <MessagesPage auth={auth} conversationId={route.conversationId} />;
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
	  <Suspense fallback={<main className="route-loading">Загружаем...</main>}>{page}</Suspense>
	  <MobileNavigation activeRoute={route.name === "listing" || route.name === "sell" ? "home" : route.name} favoriteCount={favorites.size} />
	  <CookieConsent />
    </>
  );
}
