import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  Heart,
  LoaderCircle,
  MessageCircle,
  Pause,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { bodyTypes } from "../data/filterOptions.js";
import { brands as vehicleBrands } from "../data/brands.js";
import { getAnalyticsContext, trackBehavior } from "../lib/analytics.js";
import { formatMileage, formatPrice } from "../lib/format.js";
import { fetchPersonalizedAutofeed, startListingConversation } from "../lib/supabase.js";

const pageSize = 5;
const emptyFilters = {
  brand: "",
  model: "",
  city: "",
  body: "",
  yearFrom: "",
  yearTo: "",
  priceFrom: "",
  priceTo: "",
};

function AutofeedVideo({ active, item, onStarted }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !item.url || !active) return undefined;

    let cancelled = false;
    const isHls = item.url.includes(".m3u8");
    const supportsNativeHls = Boolean(video.canPlayType("application/vnd.apple.mpegurl"));

    if (isHls && !supportsNativeHls) {
      import("hls.js/dist/hls.light.min.js").then(({ default: Hls }) => {
        if (cancelled) return;
        if (!Hls.isSupported()) {
          video.src = item.url;
          return;
        }

        const hls = new Hls({
          capLevelToPlayerSize: true,
          startLevel: -1,
          maxBufferLength: 15,
          backBufferLength: 0,
        });
        hls.loadSource(item.url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => setPlaying(false)));
        hlsRef.current = hls;
      }).catch(() => {
        if (!cancelled) video.src = item.url;
      });
    } else {
      video.src = item.url;
    }

    return () => {
      cancelled = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
      video.removeAttribute("src");
    };
  }, [active, item.url]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (active) {
      video.play().catch(() => setPlaying(false));
    } else {
      video.pause();
      video.currentTime = 0;
    }
  }, [active]);

  async function togglePlaying() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) await video.play().catch(() => undefined);
    else video.pause();
  }

  function toggleMuted() {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  }

  return (
    <div className="autofeed-video">
      <video
        ref={videoRef}
        loop
        muted={muted}
        playsInline
        poster={item.posterUrl || undefined}
        preload={active ? "metadata" : "none"}
        onPause={() => setPlaying(false)}
        onPlay={() => {
          setPlaying(true);
          onStarted?.();
        }}
      />
      <button className="autofeed-center-play" type="button" aria-label={playing ? "Пауза" : "Воспроизвести"} onClick={togglePlaying}>
        {playing ? <Pause aria-hidden="true" size={25} fill="currentColor" /> : <Play aria-hidden="true" size={28} fill="currentColor" />}
      </button>
      <button className="autofeed-sound" type="button" aria-label={muted ? "Включить звук" : "Выключить звук"} onClick={toggleMuted}>
        {muted ? <VolumeX aria-hidden="true" size={21} /> : <Volume2 aria-hidden="true" size={21} />}
      </button>
    </div>
  );
}

function MediaRail({ active, listing }) {
  const trackRef = useRef(null);
  const [index, setIndex] = useState(0);
  const openingRef = useRef(false);
  const slides = useMemo(() => [listing.video, ...listing.photos.slice(0, 3)].filter(Boolean), [listing]);

  useEffect(() => {
    setIndex(0);
    openingRef.current = false;
    trackRef.current?.scrollTo({ left: 0, behavior: "auto" });
  }, [listing.id]);

  function handleScroll() {
    const track = trackRef.current;
    if (!track?.clientWidth) return;
    const next = Math.round(track.scrollLeft / track.clientWidth);
    setIndex(Math.min(next, slides.length));
    if (next >= slides.length && !openingRef.current) {
      openingRef.current = true;
      trackBehavior("open", { listingId: listing.id, metadata: { source: "autofeed_swipe" } });
      window.setTimeout(() => {
        window.location.hash = `/cars/${listing.id}`;
      }, 120);
    }
  }

  return (
    <>
      <div className="autofeed-progress" aria-label={`${index + 1} из ${slides.length}`}>
        {slides.map((item, itemIndex) => (
          <i className={itemIndex <= index ? "active" : ""} key={item.id} />
        ))}
      </div>
      <div className="autofeed-media-track" ref={trackRef} onScroll={handleScroll}>
        {slides.map((item, itemIndex) => (
          <div className="autofeed-media-slide" key={item.id}>
            {item.kind === "video" ? (
              <AutofeedVideo
                active={active && index === itemIndex}
                item={item}
                onStarted={() => trackBehavior("active_view", {
                  listingId: listing.id,
                  metadata: { source: "autofeed", media: "video", action: "play" },
                })}
              />
            ) : (
              <img src={item.url} alt={listing.title} loading={active ? "eager" : "lazy"} />
            )}
          </div>
        ))}
        <div className="autofeed-open-sentinel" aria-hidden="true">
          <ChevronRight size={34} />
          <span>Открываем объявление</span>
        </div>
      </div>
    </>
  );
}

function AutofeedCard({ active, favorite, listing, onFavoriteToggle, onMessage, position }) {
  useEffect(() => {
    if (!active) return undefined;
    const started = performance.now();
    trackBehavior("impression", { listingId: listing.id, position, metadata: { source: "autofeed" } });
    return () => {
      const duration = Math.round(performance.now() - started);
      trackBehavior("active_view", {
        listingId: listing.id,
        position,
        activeMilliseconds: duration,
        metadata: { source: "autofeed" },
      });
      if (duration >= 3000) {
        trackBehavior("qualified_view", { listingId: listing.id, position, activeMilliseconds: duration });
      }
    };
  }, [active, listing.id, position]);

  return (
    <article className="autofeed-card">
      <MediaRail active={active} listing={listing} />
      <div className="autofeed-shade" />
      <div className="autofeed-copy">
        <span className="autofeed-availability">В наличии</span>
        <h2>{listing.title}</h2>
        <p>{listing.year} · {listing.engineVolume ? `${listing.engineVolume} л · ` : ""}{listing.gearbox}</p>
        <strong>{formatPrice(listing.price)}</strong>
        <small>{listing.city} · {listing.seller}</small>
        <a href={`#/cars/${listing.id}`} onClick={() => trackBehavior("open", { listingId: listing.id, position, metadata: { source: "autofeed_button" } })}>
          Открыть объявление <ChevronRight aria-hidden="true" size={21} />
        </a>
      </div>
      <div className="autofeed-actions">
        <button className={favorite ? "active" : ""} type="button" aria-label={favorite ? "Убрать из избранного" : "Добавить в избранное"} onClick={() => onFavoriteToggle(listing.id)}>
          <Heart aria-hidden="true" size={29} fill={favorite ? "currentColor" : "none"} />
        </button>
        <button type="button" aria-label="Написать продавцу" onClick={() => onMessage(listing.id)}>
          <MessageCircle aria-hidden="true" size={29} />
        </button>
      </div>
      <span className="autofeed-media-hint">Видео · {Math.min(listing.photos.length, 3)} фото</span>
      <span className="autofeed-mileage">{formatMileage(listing.mileage)}</span>
    </article>
  );
}

function FeedFilters({ draft, onApply, onChange, onClose, onReset }) {
  return (
    <div className="feed-filter-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="feed-filter-sheet" role="dialog" aria-modal="true" aria-labelledby="feed-filter-title">
        <header>
          <div>
            <span>Автолента</span>
            <h2 id="feed-filter-title">Что показывать</h2>
          </div>
          <button type="button" aria-label="Закрыть фильтр" onClick={onClose}><X size={22} /></button>
        </header>
        <div className="feed-filter-fields">
          <label>Марка
            <select value={draft.brand} onChange={(event) => onChange({ brand: event.target.value, model: "" })}>
              <option value="">Любая марка</option>
			  {vehicleBrands.map((brand) => <option key={brand} value={brand}>{brand}</option>)}
            </select>
          </label>
          <label>Модель
            <input type="text" placeholder="Любая модель" value={draft.model} onChange={(event) => onChange({ model: event.target.value })} />
          </label>
          <label>Город
            <input type="text" placeholder="Весь Казахстан" value={draft.city} onChange={(event) => onChange({ city: event.target.value })} />
          </label>
          <label>Кузов
            <select value={draft.body} onChange={(event) => onChange({ body: event.target.value })}>
              <option value="">Любой кузов</option>
              {bodyTypes.map((body) => <option key={body} value={body}>{body}</option>)}
            </select>
          </label>
          <label>Год от
            <input type="number" min="1900" max="2100" placeholder="2015" value={draft.yearFrom} onChange={(event) => onChange({ yearFrom: event.target.value })} />
          </label>
          <label>Год до
            <input type="number" min="1900" max="2100" placeholder="2026" value={draft.yearTo} onChange={(event) => onChange({ yearTo: event.target.value })} />
          </label>
          <label>Цена от, ₸
            <input type="number" min="0" placeholder="5 000 000" value={draft.priceFrom} onChange={(event) => onChange({ priceFrom: event.target.value })} />
          </label>
          <label>Цена до, ₸
            <input type="number" min="0" placeholder="20 000 000" value={draft.priceTo} onChange={(event) => onChange({ priceTo: event.target.value })} />
          </label>
        </div>
        <footer>
          <button className="feed-filter-reset" type="button" onClick={onReset}><RotateCcw size={17} />Сбросить</button>
          <button className="feed-filter-apply" type="button" onClick={onApply}>Показать</button>
        </footer>
      </section>
    </div>
  );
}

export function AutofeedPage({ auth, favorites, onFavoriteToggle }) {
  const [analytics, setAnalytics] = useState(getAnalyticsContext);
  const [listings, setListings] = useState([]);
  const [filters, setFilters] = useState(emptyFilters);
  const [draftFilters, setDraftFilters] = useState(emptyFilters);
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState("");
  const feedRef = useRef(null);

  const load = useCallback(async (nextFilters, reset = false) => {
    const offset = reset ? 0 : listings.length;
    reset ? setLoading(true) : setLoadingMore(true);
    setError("");
    try {
      const page = await fetchPersonalizedAutofeed({
        ...analytics,
        filters: nextFilters,
        offset,
        limit: pageSize,
      });
      setListings((current) => reset ? page : [...current, ...page.filter((item) => !current.some((existing) => existing.id === item.id))]);
      setHasMore(page.length === pageSize);
      if (reset) {
        setActiveIndex(0);
        feedRef.current?.scrollTo({ top: 0, behavior: "auto" });
      }
    } catch (loadError) {
      setError(loadError.message || "Не удалось загрузить Автоленту.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [analytics, listings.length]);

  useEffect(() => {
    const handleConsent = () => setAnalytics(getAnalyticsContext());
    window.addEventListener("qazauto-consent-changed", handleConsent);
    return () => window.removeEventListener("qazauto-consent-changed", handleConsent);
  }, []);

  useEffect(() => {
    load(filters, true);
    // Filters are applied explicitly from the sheet; consent changes create a new feed identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analytics.anonymousId]);

  useEffect(() => {
    if (hasMore && !loading && !loadingMore && activeIndex >= listings.length - 2) {
      load(filters, false);
    }
  }, [activeIndex, filters, hasMore, load, loading, loadingMore, listings.length]);

  function handleVerticalScroll() {
    const feed = feedRef.current;
    if (!feed?.clientHeight) return;
    setActiveIndex(Math.min(Math.round(feed.scrollTop / feed.clientHeight), Math.max(0, listings.length - 1)));
  }

  function applyFilters() {
    setFilters(draftFilters);
    setFilterOpen(false);
    trackBehavior("search", { metadata: { ...draftFilters, source: "autofeed_filter" } });
    load(draftFilters, true);
  }

  function resetFilters() {
    setDraftFilters(emptyFilters);
    setFilters(emptyFilters);
    setFilterOpen(false);
    load(emptyFilters, true);
  }

  async function openConversation(listingId) {
    if (!auth.session) {
      window.location.hash = "/account";
      return;
    }
    try {
      const conversationId = await startListingConversation(listingId);
      trackBehavior("message_started", { listingId, metadata: { source: "autofeed" } });
      window.location.hash = `/messages/${conversationId}`;
    } catch (conversationError) {
      setError(conversationError.message || "Не удалось открыть диалог.");
    }
  }

  return (
    <main className="autofeed-page">
      <header className="autofeed-header">
        <a className="autofeed-brand" href="#/" aria-label="QazAuto"><b>Qaz</b>Auto</a>
        <strong>Автолента</strong>
        <button type="button" aria-label="Фильтр Автоленты" onClick={() => {
          setDraftFilters(filters);
          setFilterOpen(true);
        }}><SlidersHorizontal size={25} /></button>
      </header>

      {loading ? (
        <div className="autofeed-state"><LoaderCircle className="loading-icon" size={30} /><span>Собираем вашу ленту</span></div>
      ) : error && !listings.length ? (
        <div className="autofeed-state error"><strong>Автолента пока недоступна</strong><span>{error}</span><button type="button" onClick={() => load(filters, true)}>Повторить</button></div>
      ) : !listings.length ? (
        <div className="autofeed-state"><strong>Под фильтры пока нет видео</strong><span>Сбросьте фильтр или вернитесь позже.</span><button type="button" onClick={resetFilters}>Смотреть рекомендации</button></div>
      ) : (
        <div className="autofeed-stack" ref={feedRef} onScroll={handleVerticalScroll}>
          {listings.map((listing, index) => (
            <AutofeedCard
              active={index === activeIndex}
              favorite={favorites.has(listing.id)}
              key={listing.id}
              listing={listing}
              onFavoriteToggle={onFavoriteToggle}
              onMessage={openConversation}
              position={index}
            />
          ))}
          {loadingMore && <div className="autofeed-loading-more"><LoaderCircle className="loading-icon" size={25} /></div>}
        </div>
      )}

      {error && listings.length > 0 && <p className="autofeed-toast" role="alert">{error}</p>}
      {filterOpen && (
        <FeedFilters
          draft={draftFilters}
          onApply={applyFilters}
          onChange={(patch) => setDraftFilters((current) => ({ ...current, ...patch }))}
          onClose={() => setFilterOpen(false)}
          onReset={resetFilters}
        />
      )}
    </main>
  );
}
