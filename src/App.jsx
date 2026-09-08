import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
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
import { useUnreadMessages } from "./hooks/useUnreadMessages.js";
import { mediaApiConfigured, uploadListingMedia } from "./lib/mediaApi.js";
import { createDefaultFilters, filterListings, sortListings } from "./lib/search.js";
import { trackBehavior } from "./lib/analytics.js";
import {
  createListing,
	fetchAdminAccess,
  fetchListings,
	  fetchFavoriteIds,
  publishListing,
	  setFavorite,
  supabase
} from "./lib/supabase.js";

const AutofeedPage = lazy(() => import("./pages/AutofeedPage.jsx").then((module) => ({ default: module.AutofeedPage })));
const MessagesPage = lazy(() => import("./pages/MessagesPage.jsx").then((module) => ({ default: module.MessagesPage })));
const AdminPage = lazy(() => import("./pages/AdminPage.jsx").then((module) => ({ default: module.AdminPage })));

function unseenFavoritesKey(userId) {
  return `qazauto:unseen-favorites:${userId}`;
}

function readUnseenFavorites(userId) {
  if (!userId) return new Set();
  try {
    const stored = JSON.parse(sessionStorage.getItem(unseenFavoritesKey(userId)) || "[]");
    return new Set(Array.isArray(stored) ? stored.filter((id) => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

function writeUnseenFavorites(userId, ids) {
  if (!userId) return;
  try {
    sessionStorage.setItem(unseenFavoritesKey(userId), JSON.stringify([...ids]));
  } catch {
    // The in-memory counter still works when browser storage is unavailable.
  }
}

function getRoute() {
  const hash = window.location.hash;
  const listingMatch = hash.match(/^#\/cars\/([^/?#]+)/);
  if (listingMatch) return { name: "listing", listingId: decodeURIComponent(listingMatch[1]) };
  if (hash.startsWith("#/sell")) return { name: "sell" };
  if (hash.startsWith("#/admin")) return { name: "admin" };
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
  const [unseenFavorites, setUnseenFavorites] = useState(() => new Set());
	const [adminAccess, setAdminAccess] = useState({ allowed: false, loading: false });
  const auth = useAuth();
  const authenticatedUserId = auth.session?.user?.id || "";
  const favoriteLoadRevisionRef = useRef(0);
  const pendingFavoritesRef = useRef(new Set());
  const unreadMessageCount = useUnreadMessages(auth.session);

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
		if (!authenticatedUserId || !supabase) {
			setAdminAccess({ allowed: false, loading: false });
			return undefined;
		}

		let active = true;
		setAdminAccess({ allowed: false, loading: true });
		fetchAdminAccess()
			.then((allowed) => {
				if (active) setAdminAccess({ allowed, loading: false });
			})
			.catch((error) => {
				console.error("Не удалось проверить права администратора", error);
				if (active) setAdminAccess({ allowed: false, loading: false });
			});
		return () => { active = false; };
	}, [authenticatedUserId]);

	useEffect(() => {
		const loadRevision = ++favoriteLoadRevisionRef.current;
		pendingFavoritesRef.current.clear();
		if (!authenticatedUserId) {
			setFavorites(new Set());
			return undefined;
		}
		let active = true;
		fetchFavoriteIds()
			.then((ids) => {
				if (active && favoriteLoadRevisionRef.current === loadRevision) setFavorites(new Set(ids));
			})
			.catch((error) => console.error("Не удалось загрузить избранное", error));
		return () => { active = false; };
	}, [authenticatedUserId]);

	useEffect(() => {
		if (!authenticatedUserId) {
			setUnseenFavorites(new Set());
			return;
		}
		if (route.name === "favorites") {
			writeUnseenFavorites(authenticatedUserId, new Set());
			setUnseenFavorites(new Set());
			return;
		}
		setUnseenFavorites(readUnseenFavorites(authenticatedUserId));
	}, [authenticatedUserId, route.name]);

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
		if (!authenticatedUserId) {
			window.location.hash = "/account";
			return;
		}
		if (pendingFavoritesRef.current.has(id)) return;
		pendingFavoritesRef.current.add(id);
		favoriteLoadRevisionRef.current += 1;
		const nextFavorite = !favorites.has(id);
		const wasUnseen = unseenFavorites.has(id);
    setFavorites((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
		setUnseenFavorites((current) => {
			const next = new Set(current);
			nextFavorite ? next.add(id) : next.delete(id);
			writeUnseenFavorites(authenticatedUserId, next);
			return next;
		});
		try {
			await setFavorite(id, nextFavorite, authenticatedUserId);
			trackBehavior(nextFavorite ? "favorite" : "unfavorite", { listingId: id });
		} catch (error) {
			setFavorites((current) => {
				const next = new Set(current);
				nextFavorite ? next.delete(id) : next.add(id);
				return next;
			});
			setUnseenFavorites((current) => {
				const next = new Set(current);
				wasUnseen ? next.add(id) : next.delete(id);
				writeUnseenFavorites(authenticatedUserId, next);
				return next;
			});
			console.error("Не удалось обновить избранное", error);
		} finally {
			pendingFavoritesRef.current.delete(id);
		}
  }

	function clearUnseenFavorites() {
		setUnseenFavorites(new Set());
		writeUnseenFavorites(authenticatedUserId, new Set());
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
	} else if (route.name === "admin") {
		page = <AdminPage access={adminAccess} auth={auth} />;
  } else if (route.name === "account") {
    page = <AccountPage auth={auth} isAdmin={adminAccess.allowed} />;
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
		page = <FavoritesPage authenticated={Boolean(auth.session)} favorites={favorites} listings={listings} onFavoriteToggle={toggleFavorite} />;
	} else if (route.name === "messages") {
		page = <MessagesPage auth={auth} conversationId={route.conversationId} />;
  } else {
    page = (
      <HomePage
        allListings={listings}
        authenticated={Boolean(auth.session)}
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
      <Header favoriteCount={favorites.size} onFavoritesOpen={clearUnseenFavorites} unreadMessageCount={unreadMessageCount} />
	  <Suspense fallback={<main className="route-loading">Загружаем...</main>}>{page}</Suspense>
	  <MobileNavigation
		activeRoute={route.name === "listing" || route.name === "sell" ? "home" : route.name === "admin" ? "account" : route.name}
		favoriteNotificationCount={unseenFavorites.size}
		onFavoritesOpen={clearUnseenFavorites}
		unreadMessageCount={unreadMessageCount}
	  />
	  <CookieConsent />
    </>
  );
}
