import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Heart,
  LoaderCircle,
  MessageCircle,
  Pause,
  Play,
  RotateCcw,
  Share2,
  SlidersHorizontal,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { bodyTypes } from "../data/filterOptions.js";
import { brands as vehicleBrands } from "../data/brands.js";
import { getAnalyticsContext, trackBehavior } from "../lib/analytics.js";
import {
  autofeedRefreshEvent,
  clearAutofeedState,
  readAutofeedState,
  requestAutofeedRefresh,
  writeAutofeedState,
} from "../lib/autofeedState.js";
import { formatPrice } from "../lib/format.js";
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

function AutofeedVideo({ active, item, muted, onStarted }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
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

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  async function togglePlaying() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) await video.play().catch(() => undefined);
    else video.pause();
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
    </div>
  );
}

function MediaRail({ active, initialIndex, listing, muted, onIndexChange }) {
  const trackRef = useRef(null);
  const slides = useMemo(() => [listing.video, ...listing.photos.slice(0, 3)].filter(Boolean), [listing]);
  const [index, setIndex] = useState(() => Math.min(initialIndex || 0, Math.max(0, slides.length - 1)));
  const openingRef = useRef(false);

  useEffect(() => {
    const restoredIndex = Math.min(initialIndex || 0, Math.max(0, slides.length - 1));
    setIndex(restoredIndex);
    openingRef.current = false;
    window.requestAnimationFrame(() => {
      const track = trackRef.current;
      if (track) track.scrollTo({ left: restoredIndex * track.clientWidth, behavior: "auto" });
    });
    // The initial index is read only when this listing is mounted again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing.id]);

  function handleScroll() {
    const track = trackRef.current;
    if (!track?.clientWidth) return;
    const next = Math.round(track.scrollLeft / track.clientWidth);
    const visibleIndex = Math.min(next, Math.max(0, slides.length - 1));
    if (visibleIndex !== index) {
      setIndex(visibleIndex);
      onIndexChange(visibleIndex);
    }
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
                muted={muted}
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

function AutofeedCard({ active, favorite, listing, mediaIndex, muted, onFavoriteToggle, onMediaIndexChange, onMessage, onMutedChange, position }) {
  const [detailsVisible, setDetailsVisible] = useState(true);
  const [shareNotice, setShareNotice] = useState("");
  const shareTimerRef = useRef(0);

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

  useEffect(() => () => window.clearTimeout(shareTimerRef.current), []);

  async function shareListing() {
    const url = `${window.location.origin}${window.location.pathname}#/cars/${listing.id}`;
    const shareData = { title: listing.title, text: `${listing.title} · ${formatPrice(listing.price)}`, url };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareNotice("Ссылка скопирована");
      window.clearTimeout(shareTimerRef.current);
      shareTimerRef.current = window.setTimeout(() => setShareNotice(""), 1800);
    } catch (shareError) {
      if (shareError?.name !== "AbortError") {
        setShareNotice("Не удалось поделиться");
      }
    }
  }

  return (
    <article className="autofeed-card">
      <MediaRail
        active={active}
        initialIndex={mediaIndex}
        listing={listing}
        muted={muted}
        onIndexChange={onMediaIndexChange}
      />
      <div className="autofeed-shade" />
      <div className={`autofeed-copy${detailsVisible ? "" : " is-collapsed"}`}>
        <div className="autofeed-copy-controls">
          {detailsVisible && <span className="autofeed-availability">В наличии</span>}
          <button
            className="autofeed-copy-toggle"
            type="button"
            aria-expanded={detailsVisible}
            onClick={() => setDetailsVisible((current) => !current)}
          >
            {detailsVisible ? "Скрыть" : "Развернуть"}
            {detailsVisible ? <ChevronDown aria-hidden="true" size={15} /> : <ChevronUp aria-hidden="true" size={15} />}
          </button>
        </div>
        {detailsVisible && (
          <>
            <h2>{listing.title}</h2>
            <p>{listing.year} · {listing.engineVolume ? `${listing.engineVolume} л · ` : ""}{listing.gearbox}</p>
            <strong>{formatPrice(listing.price)}</strong>
            <small>{listing.city} · {listing.seller}</small>
          </>
        )}
        <a href={`#/cars/${listing.id}`} onClick={() => trackBehavior("open", { listingId: listing.id, position, metadata: { source: "autofeed_button" } })}>
          Перейти к объявлению <ChevronRight aria-hidden="true" size={21} />
        </a>
      </div>
      <div className="autofeed-actions">
        <button
          className={mediaIndex === 0 ? "" : "autofeed-action-hidden"}
          type="button"
          aria-label={muted ? "Включить звук" : "Выключить звук"}
          aria-hidden={mediaIndex === 0 ? undefined : "true"}
          disabled={mediaIndex !== 0}
          onClick={() => onMutedChange(!muted)}
        >
          {muted ? <VolumeX aria-hidden="true" size={25} /> : <Volume2 aria-hidden="true" size={25} />}
        </button>
        <button className={favorite ? "active" : ""} type="button" aria-label={favorite ? "Убрать из избранного" : "Добавить в избранное"} onClick={() => onFavoriteToggle(listing.id)}>
          <Heart aria-hidden="true" size={29} fill={favorite ? "currentColor" : "none"} />
        </button>
        <button type="button" aria-label="Написать продавцу" onClick={() => onMessage(listing.id)}>
          <MessageCircle aria-hidden="true" size={29} />
        </button>
        <button type="button" aria-label="Поделиться объявлением" onClick={shareListing}>
          <Share2 aria-hidden="true" size={28} />
        </button>
      </div>
      {shareNotice && <span className="autofeed-share-notice" role="status">{shareNotice}</span>}
      <span className="autofeed-media-hint">Видео · {Math.min(listing.photos.length, 3)} фото</span>
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
  const [restoredState] = useState(readAutofeedState);
  const [analytics, setAnalytics] = useState(getAnalyticsContext);
  const [listings, setListings] = useState(() => restoredState?.listings || []);
  const [filters, setFilters] = useState(() => restoredState?.filters || emptyFilters);
  const [draftFilters, setDraftFilters] = useState(() => restoredState?.filters || emptyFilters);
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() => restoredState?.activeIndex || 0);
  const [mediaIndexes, setMediaIndexes] = useState(() => restoredState?.mediaIndexes || {});
  const [muted, setMuted] = useState(true);
  const [loading, setLoading] = useState(() => !restoredState?.listings?.length);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(() => restoredState?.hasMore ?? true);
  const [error, setError] = useState("");
  const feedRef = useRef(null);
  const initialFeedHandledRef = useRef(false);
  const loadedIdentityRef = useRef(analytics.anonymousId);

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
        setMediaIndexes({});
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
    if (loading || !listings.length) return;
    writeAutofeedState({ activeIndex, filters, hasMore, listings, mediaIndexes });
  }, [activeIndex, filters, hasMore, listings, loading, mediaIndexes]);

  useEffect(() => {
    if (loading || !listings.length || !feedRef.current) return;
    window.requestAnimationFrame(() => {
      const feed = feedRef.current;
      if (feed) feed.scrollTo({ top: activeIndex * feed.clientHeight, behavior: "auto" });
    });
  }, [loading, listings.length]);

  useEffect(() => {
    const handleConsent = () => setAnalytics(getAnalyticsContext());
    window.addEventListener("qazauto-consent-changed", handleConsent);
    return () => window.removeEventListener("qazauto-consent-changed", handleConsent);
  }, []);

  useEffect(() => {
    if (!initialFeedHandledRef.current) {
      initialFeedHandledRef.current = true;
      if (restoredState?.listings?.length) return;
    } else if (loadedIdentityRef.current === analytics.anonymousId) {
      return;
    }

    loadedIdentityRef.current = analytics.anonymousId;
    clearAutofeedState();
    load(filters, true);
    // Filters are applied explicitly from the sheet; consent changes create a new feed identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analytics.anonymousId]);

  useEffect(() => {
    const refreshFeed = () => {
      clearAutofeedState();
      setFilters(emptyFilters);
      setDraftFilters(emptyFilters);
      setFilterOpen(false);
      load(emptyFilters, true);
    };
    window.addEventListener(autofeedRefreshEvent, refreshFeed);
    return () => window.removeEventListener(autofeedRefreshEvent, refreshFeed);
  }, [load]);

  useEffect(() => {
    if (hasMore && !loading && !loadingMore && activeIndex >= listings.length - 2) {
      load(filters, false);
    }
  }, [activeIndex, filters, hasMore, load, loading, loadingMore, listings.length]);

  function handleVerticalScroll() {
    const feed = feedRef.current;
    if (!feed?.clientHeight) return;
    const nextIndex = Math.min(Math.round(feed.scrollTop / feed.clientHeight), Math.max(0, listings.length - 1));
    if (nextIndex === activeIndex) return;
    setActiveIndex(nextIndex);
    writeAutofeedState({ activeIndex: nextIndex, filters, hasMore, listings, mediaIndexes });
  }

  function handleMediaIndexChange(listingId, nextIndex) {
    setMediaIndexes((current) => {
      if (current[listingId] === nextIndex) return current;
      const nextMediaIndexes = { ...current, [listingId]: nextIndex };
      writeAutofeedState({ activeIndex, filters, hasMore, listings, mediaIndexes: nextMediaIndexes });
      return nextMediaIndexes;
    });
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
        <a className="autofeed-title-refresh" href="#/autofeed" aria-label="Обновить Автоленту" onClick={requestAutofeedRefresh}>Автолента</a>
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
              mediaIndex={mediaIndexes[listing.id] || 0}
              muted={muted}
              onFavoriteToggle={onFavoriteToggle}
              onMediaIndexChange={(nextIndex) => handleMediaIndexChange(listing.id, nextIndex)}
              onMessage={openConversation}
              onMutedChange={setMuted}
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
